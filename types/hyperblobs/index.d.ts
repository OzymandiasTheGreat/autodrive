/// <reference types="hypercore" />
/// <reference types="streamx" />
declare module "hyperblobs" {
  import Hypercore from "hypercore"
  import { Readable, Writable } from "streamx"

  interface Blob {
    byteOffset: number
    blockOffset: number
    blockLength: number
    byteLength: number
  }

  export default class Hyperblobs {
    core: Hypercore<unknown>

    constructor(core: Hypercore<unknown>, options?: { blockSize?: number })

    put(
      blob: Uint8Array,
      options?: { blockSize?: number; start?: number; end?: number; length?: number; core?: Hypercore<unknown> },
    ): Promise<Blob>
    get(blob: Blob, options?: { core?: Hypercore<unknown>; wait?: boolean; timeout?: number }): Promise<Uint8Array>
    clear(blob: Blob, options?: { diff?: false }): Promise<null>
    clear(blob: Blob, options: { diff: true }): Promise<{ blocks: number }>
    clear(blob: Blob, options?: { diff?: boolean }): Promise<{ blocks: number } | null>
    createReadStream(blob: Blob, options?: { core?: Hypercore<unknown>; wait?: boolean; timeout?: number }): Readable<Uint8Array>
    createWriteStream(options?: {}): Writable<Uint8Array> & { id: Blob }
  }
}
