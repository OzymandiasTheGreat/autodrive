/// <reference types="node" />
/// <reference types="compact-encoding" />
/// <reference types="hypercore-crypto" />
/// <reference types="random-access-storage" />
/// <reference types="streamx" />
declare module "hypercore" {
  import { EventEmitter } from "events"
  import { Encoding } from "compact-encoding"
  import * as crypto from "hypercore-crypto"
  import RandomAccessStorage from "random-access-storage"
  import { Readable, Duplex } from "streamx"

  type Storage = string | ((filename: string) => RandomAccessStorage) | RandomAccessStorage

  class Peer<V> {
    core: Hypercore<V>
    remotePublicKey: Uint8Array
    paused: boolean
    removed: boolean
    readonly remoteContiguousLength: number
    isActive(): boolean
  }

  interface HypercoreOptions<V> {
    compat?: boolean
    createIfMissing?: boolean
    overwrite?: boolean
    sparse?: boolean
    valueEncoding?: Encoding<V> | null
    encodeBatch?: ((batch: V[]) => Uint8Array) | null
    keyPair?: { publicKey: Uint8Array; secretKey: Uint8Array } | null
    encryptionKey?: Uint8Array | null
    onwait?: (() => void) | null
    timeout?: number
    writable?: boolean
    inflightRange?: [number, number] | null
    manifest?: PartialManifest
  }

  interface HypercoreGetOptions<V> {
    wait?: boolean
    onwait?: () => void
    timeout?: number
    valueEncoding?: Encoding<V>
    decrypt?: boolean
  }

  interface Range {
    start?: number
    end?: number
    length?: number
    blocks?: number[]
    linear?: boolean
  }

  interface Manifest {
    version: number
    hash: "blake2b"
    allowPatch: boolean
    quorum: number
    signers: {
      signature: "ed25519"
      namespace: Uint8Array
      publicKey: Uint8Array
    }[]
    prologue: Uint8Array | null
  }

  interface PartialManifest extends Partial<Manifest> {
    signers: (Partial<Manifest["signers"][0]> & { publicKey: Uint8Array })[]
  }

  class Core {
    header: {
      external: unknown | null
      key: Uint8Array
      manifest: Manifest
      keyPair: {
        publicKey: Uint8Array
        secretKey: Uint8Array
      } | null
      userData: {
        key: string
        value: Uint8Array
      }[]
      tree: {
        fork: number
        length: number
        rootHash: Uint8Array
        signature: Uint8Array
      }
      hints: {
        reorgs: unknown[]
        contiguousLength: number
      }
    }
  }

  class Replicator {
    isDownloading(): boolean
  }

  export default class Hypercore<T> extends EventEmitter<{
    "close": []
    "ready": []
    "append": []
    "truncate": [unknown, number]
    "peer-add": [Peer<T>]
    "peer-remove": [Peer<T>]
    "upload": [number, number, Peer<T>]
    "download": [number, number, Peer<T>]
  }> {
    writable: boolean
    readable: boolean
    id: string
    key: Uint8Array
    discoveryKey: Uint8Array
    encryptionKey: Uint8Array
    keyPair: {
      publicKey: Uint8Array
      secretKey: Uint8Array
    }
    length: number
    contiguousLength: number
    fork: number
    padding: number
    core: Core
    replicator: Replicator
    opened: boolean
    closed: boolean
    opening: Promise<void> | null
    closing: Promise<void> | null
    manifest: Manifest

    constructor(storage: Storage, key: Uint8Array | null, options?: HypercoreOptions<T>)

    static key(manifest: PartialManifest | Uint8Array, options?: { compat?: boolean; version?: number; namespace?: Uint8Array }): Uint8Array
    static discoveryKey(key: Uint8Array): Uint8Array
    static getProtocolMuxer(stream: Duplex<unknown, unknown>): Protomux
    static createProtocolStream(
      isInitiator: boolean | Duplex<unknown, unknown>,
      options = {
        stream: Duplex<unknown, unknown> | null,
        keepAlive: boolean,
        ondiscoverykey: (discoveryKey: Uint8Array) => Promise<void>,
      } & NoiseSecretStreamOptions,
    ): Duplex<unknown, unknown>

    append(block: T | T[]): Promise<{ length: number; byteLength: number }>
    get(index: number, options?: HypercoreGetOptions<T>): Promise<T>
    get<V>(index: number, options?: HypercoreGetOptions<V>): Promise<V>
    has(start: number, end?: number): Promise<boolean>
    update(options?: { wait?: boolean }): Promise<boolean>
    seek(byteOffset: number, options?: { wait?: boolean; timeout?: number }): Promise<[number, number]>
    createReadStream(options?: { start?: number; end?: number; live?: boolean; snapshot?: boolean }): Readable<T>
    createByteStream(options?: { byteOffset?: number; byteLength?: number; prefetch?: number }): Readable<Uint8Array>
    clear(start: number, end: number, options?: { diff?: boolean }): Promise<{ blocks: number }>
    clear(start: number, options?: { diff?: boolean }): Promise<{ blocks: number }>
    truncate(newLength: number, forkId?: number): Promise<void>
    purge(): Promise<void>
    download(range?: Range): { downloaded: () => Promise<void>; destroy: () => void }
    session(options?: HypercoreOptions<T>): Hypercore<T>
    session<V>(options?: HypercoreOptions<V>): Hypercore<V>
    info(options?: { storage: boolean }): Promise<{
      key: Uint8Array
      discoveryKey: Uint8Array
      length: number
      contiguousLength: number
      byteLength: number
      fork: number
      padding: number
      storage: {
        oplog: number
        tree: number
        blocks: number
        bitfield: number
      }
    }>
    ready(): Promise<void>
    close(): Promise<void>
    replicate(
      isInitiatorOrReplicationStream: boolean | Duplex<unknown, unknown>,
      options?: { session?: boolean },
    ): Duplex<Uint8Array, Uint8Array>
    findingPeers(): () => void
  }
}

declare module "hypercore/lib/caps" {
  export const MANIFEST: Uint8Array
  export const DEFAULT_NAMESPACE: Uint8Array
  export const BLOCK_ENCRYPTION: Uint8Array
}

declare module "hypercore/lib/verifier" {
  import { Manifest, PartialManifest } from "hypercore"
  export default class Verifier {
    static manifestHash(manifest: Manifest): Uint8Array
    static defaultSignerManifest(publicKey: Uint8Array): Manifest
    static createManifest(input: PartialManifest): Manifest
    static isValidManifest(key: Uint8Array, manifest: Manifest): boolean
    static isCompat(key: Uint8Array, manifest: Uint8Array): boolean
  }
}
