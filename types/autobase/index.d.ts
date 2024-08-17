/// <reference types="compact-encoding" />
/// <reference types="corestore" />
/// <reference types="hyperbee" />
/// <reference types="hypercore" />
/// <reference types="node" />
/// <reference types="ready-resource" />
/// <reference types="streamx" />
declare module "autobase" {
  import { Encoding } from "compact-encoding"
  import Corestore from "corestore"
  import { EventEmitter } from "events"
  import { Item } from "hyperbee"
  import Hypercore, { Manifest } from "hypercore"
  import ReadyResource from "ready-resource"
  import { Duplex, Readable } from "streamx"

  type Apply<V, T> = (nodes: Node<T>[], view: V, base: Autobase<V, T>) => Promise<void>
  type Open<V> = (store: Autostore) => V
  type Close<V> = (view: V) => void
  type OnIndex<V, T> = (base: Autobase<V, T>) => Promise<void>
  type Wait = () => Promise<void>

  interface KeyPair {
    publicKey: Uint8Array
    secretKey: Uint8Array
  }

  interface Head {
    key: Uint8Array
    length: number
  }

  interface Node<T> {
    indexed: boolean
    from: Hypercore<T>
    length: number
    value: T
    heads: Head[]
  }

  interface Handlers<V, T> {
    apply: Apply<V, T>
    open: Open<V>
    close?: Close<V>
    onindex?: OnIndex<V, T>
    wait?: Wait
    keyPair?: KeyPair
    ackInterval?: number
    valueEncoding?: Encoding<T>
    encrypted?: boolean
    encryptionKey?: Uint8Array | null
    fastForward?: boolean
  }

  interface GetOptions<T> {
    wait?: boolean
    onwait?: () => void
    timeout?: number
    valueEncoding?: Encoding<T>
    decrypt?: boolean
  }

  class Autocore<T> extends ReadyResource<{}> {
    indexedLength: number
    indexedByteLength: number
    length: number
    byteLength: number
    fork: number
    base: Autobase
    name: string
    originalCore: Hypercore<T>
    core: null
    appending: number
    truncating: number
    indexing: number
    id: string
    key: Uint8Array
    discoveryKey: Uint8Array
    latestKey: Uint8Array
    pendingIndexedLength: number

    reset(length: number): Promise<void>
    createSession<T>(valueEncoding: Encoding<T>, indexed: number): AutocoreSession<T>
    createSnapshot<T>(valueEncoding: Encoding<T>): AutocoreSession<T>
    seek(byteOffset: number, options?: { wait?: boolean; timeout?: number }): Promise<[number, number]>
    get(index: number, options?: GetOptions<T>): Promise<T>
    get<T>(index: number, options?: GetOptions<T>): Promise<T>
    setUserData(name: string, value: any, options?: any): Promise<void>
    getUserData(name: string): Promise<any>
    truncate(newLength: number): Promise<void>
    checkpoint(): { checkpointer: number; checkpoint: number[] }
    update(options?: { wait?: boolean }): Promise<void>
    flush(): Promise<number>
  }

  class AutocoreSession<T> extends EventEmitter<{
    ready: []
    close: [boolean]
    truncate: [number, number]
    append: []
    migrate: []
  }> {
    isAutobase: boolean
    closing: boolean
    closed: boolean
    opened: boolean
    indexed: boolean
    writable: boolean
    base: Autobase
    id: string
    key: Uint8Array
    discoveryKey: Uint8Array
    snapshotted: boolean
    fork: number
    byteLength: number
    length: number
    indexedByteLength: number
    indexedLength: number
    signedLength: number
    manifest: Manifest | null
    _source: Autocore<T>

    getBackingCore(): Autocore<T>
    setUserData(name: string, value: any, options?: any): Promise<void>
    getUserData(name: string): Promise<any>
    snapshot(): AutocoreSession<T>
    snapshot<T>(options?: { valueEncoding: Encoding<T> }): AutocoreSession<T>
    session(options?: { snapshot?: boolean; indexed?: boolean }): AutocoreSession<T>
    session<T>(options: { valueEncoding: Encoding<T>; snapshot?: boolean; indexed?: boolean }): AutocoreSession<T>
    update(options?: { wait?: boolean }): Promise<void>
    seek(byteOffset: number, options?: { wait?: boolean; timeout?: number }): Promise<[number, number]>
    get(index: number, options?: GetOptions<T>): Promise<T>
    get<T>(index: number, options?: GetOptions<T>): Promise<T>
    truncate(newLength: number): Promise<void>
    append(block: T): Promise<{ length: number; byteLength: number }>
    close(): Promise<void>
  }

  class Autostore {
    get(name: string): LinearizedCore<Uint8Array>
    get<T>(name: string, options: { valueEncoding: Encoding<T> }): AutocoreSession<T>
    get<T>(options: { name: string; valueEncoding: Encoding<T> }): AutocoreSession<T>
    update(): Promise<void>
  }

  interface Member {
    isIndexer: boolean
    isRemoved: boolean
    length: number
  }

  class SystemView extends ReadyResource<{}> {
    core: AutocoreSession<unknown>
    views: Head[]
    list(): Readable<{ seq: number; key: Uint8Array; value: Member }>
    get(key: Uint8Array, options?: { onlyActive: boolean }): Promise<Member>
    has(key: Uint8Array, options?: { onlyActive: boolean }): Promise<boolean>
  }

  export default class Autobase<V, T = Uint8Array> extends ReadyResource<{
    "reindexing": []
    "reindexed": []
    "interrupt": [Error | null]
    "error": [Error]
    "warning": [Error]
    "writable": []
    "unwritable": []
    "is-indexer": []
    "is-non-indexer": []
    "update": []
    "upgrade-available": [{ version: number; length: number }]
    "fast-forward": [number, number]
  }> {
    bootstrap: Uint8Array
    keyPair: KeyPair
    valueEncoding: Encoding<T>
    store: Corestore
    encrypted: boolean
    encryptionKey: Uint8Array | null
    local: Hypercore<T> | null
    localWriter: Writer | null
    isIndexer: boolean
    isActiveIndexer: boolean
    writable: boolean
    key: Uint8Array
    discoveryKey: Uint8Array
    updating: boolean
    fastForwardEnabled: boolean
    reindexing: boolean
    maxSupportedVersion: number
    onindex: OnIndex<V, T>
    view: V
    system: SystemView
    version: number
    interrupted: Error | null

    constructor(store: Corestore, handlers: Handlers<V, T>)
    constructor(store: Corestore, bootstrap: string | Uint8Array | null, handlers: Handlers<V, T>)
    append(value: T | T[]): Promise<void>
    update(options?: { wait?: boolean }): Promise<void>
    checkpoint(): Promise<number[]>
    replicate(isInitiator: boolean): Duplex<Uint8Array, Uint8Array>
    flush(): Promise<void>
    progress(): { processed: number; total: number }
    addWriter(key: Uint8Array, options?: { indexer?: boolean }): Promise<void>
    removeWriter(key: Uint8Array): Promise<void>
    heads(): Head[]

    static getLocalCore(store: Corestore): Hypercore<T>
    static getUserData(core: Hypercore<T>): any
  }
}

declare module "autobase/lib/core-pool" {
  import Hypercore from "hypercore"

  export default class CorePool {
    constructor()
    linger(core: Hypercore<unknown>): void
    get(key: Uint8Array): Hypercore<unknown> | null
    clear(): Promise<void>
  }
}
