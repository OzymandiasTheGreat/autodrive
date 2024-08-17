declare module "hypercore-crypto" {
  interface Node {
    index: number
    size: number
    hash: Uint8Array
  }

  export function keyPair(seed: Uint8Array): { publicKey: Uint8Array; secretKey: Uint8Array }
  export function validateKeyPair(keyPair: { publicKey: Uint8Array; secretKey: Uint8Array }): boolean
  export function sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array
  export function verify(message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): boolean
  export function data(data: Uint8Array): Uint8Array
  export function parent(a: Node, b: Node): Uint8Array
  export function tree(roots: Node[], out?: Uint8Array): Uint8Array
  export function hash(data: Uint8Array[], out?: Uint8Array): Uint8Array
  export function randomBytes(n: number): Uint8Array
  export function discoveryKey(publicKey: Uint8Array): Uint8Array
  export function namespace(name: string | Uint8Array, count: number): Uint8Array[]
  export function range(count: number): number[]
}
