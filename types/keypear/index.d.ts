declare module "keypear" {
  type KeyPair = { publicKey: Uint8Array; secretKey: Uint8Array }
  type ScalarKeyPair = { publicKey: Uint8Array; scalar: Uint8Array }

  interface Signer {
    publicKey: Uint8Array
    scalar: Uint8Array
    writable: boolean

    dh(publicKey: Uint8Array): Uint8Array
    sign(message: Uint8Array): Uint8Array
    verify(signable: Uint8Array, signature: Uint8Array): boolean
  }

  export default class Keychain {
    home: ScalarKeyPair
    base: ScalarKeyPair
    tweak: ScalarKeyPair
    head: ScalarKeyPair

    constructor(publicKeyOrKeyPair: Uint8Array | KeyPair | ScalarKeyPair)

    static from(keyChainOrPublicKeyOrKeyPair: Uint8Array | KeyPair | ScalarKeyPair | Keychain): Keychain

    get(nameOrKeyPair?: string | Uint8Array | KeyPair | ScalarKeyPair): Signer
    sub(nameOrKeyPair: string | Uint8Array | KeyPair | ScalarKeyPair): Keychain
    checkout(publicKeyOrKeyPair: Uint8Array | KeyPair | ScalarKeyPair): Keychain
  }
}
