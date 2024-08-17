declare module "compact-encoding" {
  export type JsonObject = { [Key in string]: JsonValue } & { [Key in string]?: JsonValue | undefined }
  export type JsonArray = JsonValue[] | readonly JsonValue[]
  export type JsonPrimitive = string | number | boolean | null
  export type JsonValue = JsonPrimitive | JsonObject | JsonArray

  export type AnyObject = { [Key in string]: AnyValue } & { [Key in string]?: AnyValue | undefined }
  export type AnyArray = AnyValue[] | readonly AnyValue[]
  export type AnyPrimitive = string | number | boolean | Uint8Array | null
  export type AnyValue = AnyPrimitive | AnyObject | AnyArray

  export interface State {
    start: number
    end: number
    buffer: Uint8Array
  }

  export interface Encoding<T> {
    preencode(state: State, value: T): void
    encode(state: State, value: T): void
    decode(state: State): T
  }

  export function encode<T>(enc: Encoding<T>, value: T): Uint8Array
  export function decode<T>(enc: Encoding<T>, value: Uint8Array): T

  export const raw: Encoding<Uint8Array> & {
    buffer: Encoding<Uint8Array>
    arraybuffer: Encoding<ArrayBuffer>
    uint8array: Encoding<Uint8Array>
    uint16array: Encoding<Uint16Array>
    uint32array: Encoding<Uint32Array>
    int8array: Encoding<Int8Array>
    int16array: Encoding<Int16Array>
    int32array: Encoding<Int32Array>
    biguint64array: Encoding<BigUint64Array>
    bigint64array: Encoding<BigInt64Array>
    float32array: Encoding<Float32Array>
    float64array: Encoding<Float64Array>
    string: Encoding<string>
    ascii: Encoding<string>
    hex: Encoding<string>
    base64: Encoding<string>
    utf16le: Encoding<string>
    array<T>(enc: Encoding<T>): Encoding<T[]>
    json: Encoding<JsonValue>
    ndjson: Encoding<JsonValue>
  }
  export const uint: Encoding<number>
  export const uint8: Encoding<number>
  export const uint16: Encoding<number>
  export const uint24: Encoding<number>
  export const uint32: Encoding<number>
  export const uint40: Encoding<number>
  export const uint48: Encoding<number>
  export const uint56: Encoding<number>
  export const uint64: Encoding<number>
  export const int: Encoding<number>
  export const int8: Encoding<number>
  export const int16: Encoding<number>
  export const int24: Encoding<number>
  export const int32: Encoding<number>
  export const int40: Encoding<number>
  export const int48: Encoding<number>
  export const int56: Encoding<number>
  export const int64: Encoding<number>
  export const biguint64: Encoding<number>
  export const bigint64: Encoding<number>
  export const biguint: Encoding<number>
  export const bigint: Encoding<number>
  export const float32: Encoding<number>
  export const float64: Encoding<number>
  export const lexint: Encoding<number>
  export const buffer: Encoding<Uint8Array>
  export const arraybuffer: Encoding<ArrayBuffer>
  export const uint8array: Encoding<Uint8Array>
  export const uint16array: Encoding<Uint16Array>
  export const uint32array: Encoding<Uint32Array>
  export const int8array: Encoding<Int8Array>
  export const int16array: Encoding<Int16Array>
  export const int32array: Encoding<Int32Array>
  export const biguint64array: Encoding<BigUint64Array>
  export const bigint64array: Encoding<BigInt64Array>
  export const float32array: Encoding<Float32Array>
  export const float64array: Encoding<Float64Array>
  export const bool: Encoding<boolean>
  export const string: Encoding<string> & {
    fixed(n: number): Encoding<string>
  }
  export const utf8: Encoding<string>
  export const ascii: Encoding<string> & {
    fixed(n: number): Encoding<string>
  }
  export const hex: Encoding<string> & {
    fixed(n: number): Encoding<string>
  }
  export const base64: Encoding<string> & {
    fixed(n: number): Encoding<string>
  }
  export const utf16le: Encoding<string> & {
    fixed(n: number): Encoding<string>
  }
  export const ucs2: Encoding<string> & {
    fixed(n: number): Encoding<string>
  }
  export const fixed32: Encoding<Uint8Array>
  export const fixed64: Encoding<Uint8Array>
  export const json: Encoding<JsonValue>
  export const ndjson: Encoding<JsonValue>
  export const any: Encoding<AnyValue>
  // cenc.from(enc) - Makes a compact encoder from a codec or abstract-encoding.
  export const none: Encoding<void>

  export function fixed(n: number): Encoding<Uint8Array>
  export function array<T>(enc: Encoding<T>): Encoding<T[]>
}
