/// <reference types="compact-encoding" />
/// <reference types="hypercore" />
/// <reference types="ready-resource" />
/// <reference types="streamx" />
declare module "hyperbee" {
  import { Encoding as CompactEncoding } from "compact-encoding"
  import Hypercore from "hypercore"
  import ReadyResource from "ready-resource"
  import { Duplex, Readable } from "streamx"

  type StringEncoding = "binary" | "utf-8" | "ascii" | "json"
  type Encoding<T> = CompactEncoding<T> | { encode: (value: T) => Uint8Array; decode: (buffer: Uint8Array) => T }

  interface HyperbeeOptions<K, V> {
    keyEncoding?: StringEncoding | Encoding<K>
    valueEncoding?: StringEncoding | Encoding<V>
  }

  interface GetOptions {
    wait?: boolean
    timeout?: number
  }

  interface Item<K, V> {
    seq: number
    key: K
    value: V
  }

  interface Batch<K, V> {
    tree: Hyperbee<K, V>
    core: Hypercore<unknown>
    index: number
    version: number

    ready(): Promise<void>
    put(key: K, value?: V, options?: HyperbeeOptions<K, V> & { cas?: CompareAndSwap<K, V> }): Promise<void>
    put<K, V>(key: K, value?: V, options?: HyperbeeOptions<K, V> & { cas?: CompareAndSwap<K, V> }): Promise<void>
    get(key: K, options?: HyperbeeOptions<K, V> & GetOptions): Promise<Item<K, V> | null>
    get<K, V>(key: K, options?: HyperbeeOptions<K, V> & GetOptions): Promise<Item<K, V> | null>
    del(key: K, options?: HyperbeeOptions<K, V> & { cas?: CompareAndSwap<K, V> }): Promise<void>
    del<K, V>(key: K, options?: HyperbeeOptions<K, V> & { cas?: CompareAndSwap<K, V> }): Promise<void>
    getBySeq(seq: number, options?: HyperbeeOptions<K, V> & GetOptions): Promise<Item<K, V>>
    getBySeq<K, V>(seq: number, options?: HyperbeeOptions<K, V> & GetOptions): Promise<Item<K, V>>
    createReadStream(
      options?: {
        reverse?: boolean
        limit?: number
      } & HyperbeeOptions<K, V>,
    ): Readable<Item<K, V>>
    createReadStream<K, V>(
      options?: {
        reverse?: boolean
        limit?: number
      } & HyperbeeOptions<K, V>,
    ): Readable<Item<K, V>>
    createReadStream(
      range?: Range<K>,
      options?: {
        reverse?: boolean
        limit?: number
      } & HyperbeeOptions<K, V>,
    ): Readable<Item<K, V>>
    createReadStream<K, V>(
      range?: Range<K>,
      options?: {
        reverse?: boolean
        limit?: number
      } & HyperbeeOptions<K, V>,
    ): Readable<Item<K, V>>
    peek(
      range: Range<K>,
      options?: {
        reverse?: boolean
      } & HyperbeeOptions<K, V>,
    ): Promise<Item<K, V> | null>
    peek<K, V>(
      range: Range<K>,
      options?: {
        reverse?: boolean
      } & HyperbeeOptions<K, V>,
    ): Promise<Item<K, V> | null>
    flush(): Promise<void>
    close(): Promise<void>
  }

  interface Range<K> {
    gt?: K
    gte?: K
    lt?: K
    lte?: K
  }

  interface Diff<K, V> {
    left: Item<K, V> | null
    right: Item<K, V> | null
  }

  type CompareAndSwap<K, V> = (prev: Item<K, V> | null, next: Item<K, V> | null) => boolean

  class EntryWatcher<K, V> extends ReadyResource<{ update: [] }> {
    node: Item<K, V> | null
  }

  class Watcher<K, V, M> extends ReadyResource<{ update: [] }> {
    [Symbol.asyncIterator](): AsyncIterableIterator<M extends unknown ? [Hyperbee<K, V>, Hyperbee<K, V>] : [M, M]>
  }

  export default class Hyperbee<K, V> extends ReadyResource<{}> {
    constructor(core: Hypercore<unknown>, options?: HyperbeeOptions<K, V> & { extension?: boolean; maxCacheSize?: number })

    core: Hypercore<unknown>
    version: number
    id: string
    key: Uint8Array
    discoveryKey: Uint8Array
    writable: boolean
    readable: boolean
    maxCacheSize: number

    put(key: K, value?: V, options?: HyperbeeOptions<K, V> & { cas?: CompareAndSwap<K, V> }): Promise<void>
    put<K, V>(key: K, value?: V, options?: HyperbeeOptions<K, V> & { cas?: CompareAndSwap<K, V> }): Promise<void>
    get(key: K, options?: HyperbeeOptions<K, V> & GetOptions): Promise<Item<K, V> | null>
    get<K, V>(key: K, options?: HyperbeeOptions<K, V> & GetOptions): Promise<Item<K, V> | null>
    del(key: K, options?: HyperbeeOptions<K, V> & { cas?: CompareAndSwap<K, V> }): Promise<void>
    del<K, V>(key: K, options?: HyperbeeOptions<K, V> & { cas?: CompareAndSwap<K, V> }): Promise<void>
    getBySeq(seq: number, options?: HyperbeeOptions<K, V> & GetOptions): Promise<Item<K, V>>
    getBySeq<K, V>(seq: number, options?: HyperbeeOptions<K, V> & GetOptions): Promise<Item<K, V>>
    replicate(isInitiatorOrStream: boolean | Duplex<unknown, unknown>): Duplex<Uint8Array, Uint8Array>
    batch(): Batch<K, V>
    createReadStream(
      options?: {
        reverse?: boolean
        limit?: number
      } & HyperbeeOptions<K, V>,
    ): Readable<Item<K, V>>
    createReadStream<K, V>(
      options?: {
        reverse?: boolean
        limit?: number
      } & HyperbeeOptions<K, V>,
    ): Readable<Item<K, V>>
    createReadStream(
      range?: Range<K>,
      options?: {
        reverse?: boolean
        limit?: number
      } & HyperbeeOptions<K, V>,
    ): Readable<Item<K, V>>
    createReadStream<K, V>(
      range?: Range<K>,
      options?: {
        reverse?: boolean
        limit?: number
      } & HyperbeeOptions<K, V>,
    ): Readable<Item<K, V>>
    peek(
      range: Range<K>,
      options?: {
        reverse?: boolean
      } & HyperbeeOptions<K, V>,
    ): Promise<Item<K, V> | null>
    peek<K, V>(
      range: Range<K>,
      options?: {
        reverse?: boolean
      } & HyperbeeOptions<K, V>,
    ): Promise<Item<K, V> | null>
    createHistoryStream(options?: {
      live?: boolean
      reverse?: boolean
      gte?: number
      gt?: number
      lte?: number
      lt?: number
      limit?: number
    }): Readable<Item<K, V>>
    createDiffStream(otherVersion: number, range?: Range<K, V>, options?: HyperbeeOptions<K, V> & { limit?: number }): Readable<Diff<K, V>>
    createDiffStream<K, V>(
      otherVersion: number,
      range?: Range<K, V>,
      options?: HyperbeeOptions<K, V> & { limit?: number },
    ): Readable<Diff<K, V>>
    getAndWatch(key: K, options?: HyperbeeOptions<K, V> & GetOptions): EntryWatcher<K, V>
    getAndWatch<K, V>(key: K, options?: HyperbeeOptions<K, V> & GetOptions): EntryWatcher<K, V>
    watch(range?: Range<K> & HyperbeeOptions<K, V>): Watcher<K, V>
    watch<M>(range?: Range<K>, options: HyperbeeOptions<K, V> & { map: (snapshot: Hyperbee<K, V>) => M }): Watcher<K, V, M>
    watch<K, V, M>(range?: Range<K>, options: HyperbeeOptions<K, V> & { map: (snapshot: Hyperbee<K, V>) => M }): Watcher<K, V, M>
    watch<K, V>(range?: Range<K>, options?: HyperbeeOptions<K, V>): Watcher<K, V>
    checkout(version: number): Hyperbee<K, V>
    snapshot(): Hyperbee<K, V>
  }
}
