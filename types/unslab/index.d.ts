declare module "unslab" {
  export default function unslab(buffer: Uint8Array): Uint8Array
  export default function unslab<T extends Uint8Array[]>(buffer: { [K in keyof T]: T[K] }): { [K in keyof T]: T[K] }
}
