/// <reference types="random-access-storage" />
declare module "random-access-file" {
  import RandomAccessStorage from "random-access-storage"

  interface RandomAccessFileOptions {
    truncate?: boolean
    size?: number
    readable?: boolean
    writable?: boolean
    lock?: boolean
    sparse?: boolean
  }

  export default class RandomAccessFile extends RandomAccessStorage {
    constructor(filename: string, options?: RandomAccessFileOptions)
  }
}
