import type { JSONRPCError } from '@open-rpc/client-js'
import type { RequestArguments } from '@open-rpc/client-js/build/ClientInterface'
import type { RPCData } from '../types/index.ts'
import { Client, RequestManager, WebSocketTransport } from '@open-rpc/client-js'

export interface Subscription<Data, Metadata> {
  next: (callback: (data: RPCData<Data, Metadata> | JSONRPCError) => void) => void
  close: () => void
  ws: Client

  context: {
    body: RequestArguments
    timestamp: number
    url: string
  }

  getSubscriptionId: () => number
  isConnectionPaused: () => boolean
  isConnectionOpen: () => boolean
}

export const WS_DEFAULT_OPTIONS: StreamOptions = {
  once: false,
  filter: () => true,
  timeout: 5000, // Default OpenRPC timeout
} as const

export type FilterStreamFn = (data: any) => boolean

export interface StreamOptions {
  once: boolean
  filter?: FilterStreamFn
  timeout: number
  onError?: (error?: Error) => void
  /**
   * If true or an object, we attempt reconnects when the socket closes.
   * - `retries` can be a number or a function. If it's a function, it should return true to keep retrying.
   * - `delay` is the time before trying again.
   * - `onFailed` is called when we stop retrying.
   */
  autoReconnect?: boolean | {
    retries?: number | (() => boolean)
    delay?: number
    onFailed?: () => void
  }
}

interface NotificationMessageParams {
  subscription: number
  result: object
};

export class WebSocketClient {
  private url: URL
  private isOpen = false
  private explicitlyClosed = false

  // For reconnect logic
  private retriesCount = 0
  private reconnectTimer?: ReturnType<typeof setTimeout>

  constructor(url: string) {
    const wsUrl = new URL(url.replace(/^http/, 'ws'))
    wsUrl.pathname = '/ws'
    this.url = wsUrl
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
  }

  async subscribe<
    Data,
    Metadata,
  >(
    request: RequestArguments,
    userOptions: StreamOptions,
  ): Promise<Subscription<Data, Metadata>> {
    const transport = new WebSocketTransport(this.url.toString())
    const client = new Client(new RequestManager([transport]))

    const options = {
      ...WS_DEFAULT_OPTIONS,
      ...userOptions,
    }

    // "autoReconnect" can be a boolean or an object
    const reconnectSettings
      = typeof options.autoReconnect === 'object'
        ? options.autoReconnect
        : options.autoReconnect === true
          ? {}
          : undefined

    const { once, filter, timeout } = options

    // Request subscription ID
    const subscriptionId: number = await client.request(request, timeout)
    this.explicitlyClosed = false
    this.retriesCount = 0 // reset retries on successful open

    const args: Subscription<Data, Metadata> = {
      next: (callback: (data: RPCData<Data, Metadata> | JSONRPCError) => void) => {
        client.onError((error) => {
          callback(error)
        })

        client.onNotification((event) => {
          const params = event.params as NotificationMessageParams
          const result = params.result as RPCData<Data, Metadata>

          if (filter && !filter(result.data)) {
            return
          }

          callback(result)

          if (once) {
            client.close()
          }
        })
      },
      close: () => {
        this.explicitlyClosed = true
        client.close()
      },
      getSubscriptionId: () => subscriptionId,
      isConnectionPaused: () => transport.connection.isPaused,
      isConnectionOpen: () => this.isOpen,
      context: {
        body: request,
        url: this.url.toString(),
        timestamp: Date.now(),
      },
      ws: client,
    }

    transport.connection.onopen = () => {
      this.isOpen = true
      this.retriesCount = 0
    }

    transport.connection.onclose = () => {
      this.isOpen = false
      if (!this.explicitlyClosed) {
        // Check if autoReconnect is enabled
        if (reconnectSettings) {
          const maxRetries = reconnectSettings.retries ?? -1
          const delay = reconnectSettings.delay ?? 1000
          const canKeepRetrying = (): boolean => {
            if (typeof maxRetries === 'number') {
              return maxRetries < 0 || this.retriesCount < maxRetries
            }
            else if (typeof maxRetries === 'function') {
              return maxRetries()
            }
            return false
          }

          if (canKeepRetrying()) {
            this.retriesCount++
            // clear any existing timer before setting a new one
            this.clearReconnectTimer()
            this.reconnectTimer = setTimeout(() => {
              // Try again by calling subscribe with the same args
              this.subscribe(request, userOptions).catch(() => {
                // If it still fails, we might try again
                // or pass the error to the onError callback
                const { onError } = options
                onError?.(new Error('Failed to reconnect'))
              })
            }, delay)
          }
          else {
            reconnectSettings.onFailed?.()
          }
        }
        else {
          // if autoReconnect is not enabled, call user-provided onError
          const { onError } = options
          onError?.(new Error('WebSocket connection closed unexpectedly'))
        }
      }
    }

    transport.connection.onerror = (event) => {
      console.error('WebSocket error', event)
      this.isOpen = false
      const { onError } = options
      onError?.(new Error(event.message))
    }

    return args
  }
}
