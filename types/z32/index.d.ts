declare module "z32" {
  function encode(stringOrBuffer: string | Uint8Array): string
  function decode(z32String: string): Uint8Array

  export default { encode, decode }
}
