/// <reference types="node" />
/// <reference types="hypercore" />
/// <reference types="streamx" />
declare module "corestore" {
  import { EventEmitter } from "events"
  import Hypercore, { HypercoreOptions, Storage } from "hypercore"
  import { Duplex } from "streamx"

  interface CorestoreOptions<T> extends HypercoreOptions<T> {
    cache?: boolean
    exclusive?: boolean
  }

  export default class Corestore extends EventEmitter<{
    "core-open": [Hypercore<unknown>]
    "core-close": [Hypercore<unknown>]
  }> {
    storage: Storage

    constructor(storage: Storage, options?: { inflightRange?: [number, number] })

    get<T>(options: { name?: string } & CorestoreOptions<T>): Hypercore<T>
    get<T>(options: { key?: string | Uint8Array | null } & CorestoreOptions<T>): Hypercore<T>
    replicate(isInitiatorOrReplicationStream: boolean | Duplex<unknown, unknown>, options?: unknown): Duplex<Uint8Array, Uint8Array>
    findingPeers(): () => void
    namespace(name: string | Uint8Array, options?: { detach: boolean }): Corestore
    session(options?: {
      primaryKey?: Uint8Array
      namespace?: string | Uint8Array | null
      detach?: boolean
      inflightRange?: [number, number] | null
    }): Corestore
    close(): Promise<void>
  }
}
