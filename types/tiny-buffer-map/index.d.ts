declare module "tiny-buffer-map" {
  export default class BufferMap<T> {
    constructor(other?: BufferMap<T>)

    readonly size: number

    get(key: Uint8Array): T | undefined
    set(key: Uint8Array, value: T): void
    has(key: Uint8Array): boolean
    delete(key: Uint8Array): void
    [Symbol.iterator](): IterableIterator<[Uint8Array, T]>
    keys(): IterableIterator<Uint8Array>
    values(): IterableIterator<T>
    clear(): void
  }
}
