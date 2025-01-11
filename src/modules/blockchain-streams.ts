import type { FilterStreamFn, StreamOptions, Subscription, WebSocketClient } from '../client/web-socket.ts'
import type { Block, BlockchainState, LogType, MacroBlock, MicroBlock, Validator } from '../types/index.ts'
import type { BlockLog } from '../types/logs.ts'
import { WS_DEFAULT_OPTIONS } from '../client/web-socket.ts'
import { BlockSubscriptionType, RetrieveType } from '../types/index.ts'

export interface BlockParams { retrieve?: RetrieveType.Full | RetrieveType.Partial }
export interface ValidatorElectionParams { address: string }
export interface LogsParams { addresses?: string[], types?: LogType[] }

function getBlockType(block: Block): BlockSubscriptionType {
  if (!block)
    throw new Error('Block is undefined')
  if (!('isElectionBlock' in block))
    return BlockSubscriptionType.Micro
  if (block.isElectionBlock)
    return BlockSubscriptionType.Election
  return BlockSubscriptionType.Macro
}

const isMicro: FilterStreamFn = b => getBlockType(b) === BlockSubscriptionType.Micro
const isMacro: FilterStreamFn = b => getBlockType(b) === BlockSubscriptionType.Macro
const isElection: FilterStreamFn = b => getBlockType(b) === BlockSubscriptionType.Election

/**
 * BlockchainStream class provides methods to interact with the Nimiq Albatross Node's blockchain streams.
 */
export class BlockchainStream {
  ws: WebSocketClient
  constructor(ws: WebSocketClient) {
    this.ws = ws
  }

  /**
   * Subscribes to block hash events.
   *
   * @param userOptions - Optional streaming options.
   * @returns A promise that resolves with a Subscription object.
   */
  public subscribeForBlockHashes<T = string, M = undefined>(
    userOptions?: Partial<StreamOptions>,
  ): Promise<Subscription<T, M>> {
    const options: StreamOptions = { ...WS_DEFAULT_OPTIONS, ...userOptions as StreamOptions }
    return this.ws.subscribe<T, M>({ method: 'subscribeForHeadBlockHash' }, options)
  }

  /**
   * Subscribes to election blocks.
   *
   * @param params - The block parameters.
   * @param userOptions - Optional streaming options.
   * @returns A promise that resolves with a Subscription object.
   */
  public subscribeForElectionBlocks<T = Block, M = undefined>(
    params: BlockParams = {},
    userOptions?: Partial<StreamOptions>,
  ): Promise<Subscription<T, M>> {
    const { retrieve = RetrieveType.Full } = params
    const options = { ...WS_DEFAULT_OPTIONS, ...userOptions, filter: isElection }
    return this.ws.subscribe<T, M>({ method: 'subscribeForHeadBlock', params: [retrieve === RetrieveType.Full] }, options)
  }

  /**
   * Subscribes to micro blocks.
   *
   * @param params - The block parameters.
   * @param userOptions - Optional streaming options.
   * @returns A promise that resolves with a Subscription object.
   */
  public subscribeForMicroBlocks<T = MicroBlock, M = undefined>(
    params: BlockParams = {},
    userOptions?: Partial<StreamOptions>,
  ): Promise<Subscription<T, M>> {
    const { retrieve = RetrieveType.Full } = params
    const options = { ...WS_DEFAULT_OPTIONS, ...userOptions, filter: isMicro }
    return this.ws.subscribe<T, M>({ method: 'subscribeForHeadBlock', params: [retrieve === RetrieveType.Full] }, options)
  }

  /**
   * Subscribes to macro blocks.
   *
   * @param params - The block parameters.
   * @param userOptions - Optional streaming options.
   * @returns A promise that resolves with a Subscription object.
   */
  public subscribeForMacroBlocks<T = MacroBlock, M = undefined>(
    params: BlockParams = {},
    userOptions?: Partial<StreamOptions>,
  ): Promise<Subscription<T, M>> {
    const { retrieve = RetrieveType.Full } = params || {}
    const options = { ...WS_DEFAULT_OPTIONS, ...userOptions, filter: isMacro }
    return this.ws.subscribe<T, M>({ method: 'subscribeForHeadBlock', params: [retrieve === RetrieveType.Full] }, options)
  }

  /**
   * Subscribes to all blocks.
   *
   * @param params - The block parameters.
   * @param userOptions - Optional streaming options.
   * @returns A promise that resolves with a Subscription object.
   */
  public subscribeForBlocks<T = Block, M = undefined>(
    params: BlockParams = {},
    userOptions?: Partial<StreamOptions>,
  ): Promise<Subscription<T, M>> {
    const { retrieve = RetrieveType.Full } = params
    return this.ws.subscribe<T, M>({ method: 'subscribeForHeadBlock', params: [retrieve === RetrieveType.Full] }, { ...WS_DEFAULT_OPTIONS, ...userOptions })
  }

  /**
   * Subscribes to pre epoch validators events.
   *
   * @param params - The validator election parameters.
   * @param userOptions - Optional streaming options.
   * @returns A promise that resolves with a Subscription object.
   */
  public subscribeForValidatorElectionByAddress<T = Validator, M = BlockchainState>(
    params: ValidatorElectionParams,
    userOptions?: Partial<StreamOptions>,
  ): Promise<Subscription<T, M>> {
    return this.ws.subscribe<T, M>({ method: 'subscribeForValidatorElectionByAddress', params: [params.address] }, { ...WS_DEFAULT_OPTIONS, ...userOptions })
  }

  /**
   * Subscribes to log events related to a given list of addresses and log types.
   *
   * @param params - The log parameters.
   * @param userOptions - Optional streaming options.
   * @returns A promise that resolves with a Subscription object.
   */
  public subscribeForLogsByAddressesAndTypes<T = BlockLog, M = BlockchainState>(
    params: LogsParams = {},
    userOptions?: Partial<StreamOptions>,
  ): Promise<Subscription<T, M>> {
    const { addresses = [], types = [] } = params
    return this.ws.subscribe<T, M>({ method: 'subscribeForLogsByAddressesAndTypes', params: [addresses, types] }, { ...WS_DEFAULT_OPTIONS, ...userOptions })
  }
}
