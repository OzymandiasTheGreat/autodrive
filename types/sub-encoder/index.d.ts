/// <reference types="compact-encoding" />
/// <reference types="hyperbee" />
declare module "sub-encoder" {
  import { Encoding } from "compact-encoding"
  import { Range, StringEncoding } from "hyperbee"

  export default class SubEncoder<T = Uint8Array> {
    constructor(prefix?: string | Uint8Array, encoding?: StringEncoding | Encoding<T>)
    sub(prefix: string | Uint8Array): SubEncoder<T>
    sub<T>(prefix: string | Uint8Array, encoding: StringEncoding | Encoding<T>): SubEncoder<T>
    encode(key: T): Uint8Array
    decode(buffer: Uint8Array): T
    encodeRange(range?: Range<T>): Range<Uint8Array>
  }
}
