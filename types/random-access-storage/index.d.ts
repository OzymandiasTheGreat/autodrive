/// <reference types="node" />
declare module "random-access-storage" {
  import { EventEmitter } from "events"

  type Callback = (err?: Error | null) => void
  type ReadCallback = (err: Error | null, buffer: Uint8Array) => void
  type StatCallback = (err: Error | null, stat: Stat) => void

  interface Stat {
    size: number
  }

  interface Request {
    callback: Callback | ReadCallback | StatCallback
    create?: boolean
    offset?: number
    size?: number
    data?: Uint8Array
  }

  interface RandomAccessStorageOptions {
    createAlways: boolean
    open: (req: Request) => void
    read: (req: Request) => void
    write: (req: Request) => void
    del: (req: Request) => void
    truncate: (req: Request) => void
    stat: (req: Request) => void
    suspend: (req: Request) => void
    close: (req: Request) => void
    unlink: (req: Request) => void
  }

  export default class RandomAccessStorage extends EventEmitter<{
    open: []
    close: []
    unlink: []
    suspend: []
    unsuspend: []
  }> {
    readable: boolean
    writable: boolean
    deletable: boolean
    truncatable: boolean
    statable: boolean
    opened: boolean
    closed: boolean
    unlinked: boolean
    writing: boolean

    constructor(options?: RandomAccessStorageOptions)
    open(callback: Callback): void
    read(offset: number, size: number, callback: ReadCallback): void
    write(offset: number, buffer: Uint8Array, callback?: Callback): void
    del(offset: number, size: number, callback?: Callback): void
    truncate(offset: number, callback?: Callback): void
    stat(callback: StatCallback): void
    suspend(callback?: Callback): void
    close(callback?: Callback): void
    unlink(callback?: Callback): void

    protected _open(req: Request): void
    protected _read(req: Request): void
    protected _write(req: Request): void
    protected _del(req: Request): void
    protected _truncate(req: Request): void
    protected _stat(req: Request): void
    protected _suspend(req: Request): void
    protected _close(req: Request): void
    protected _unlink(req: Request): void
  }
}
