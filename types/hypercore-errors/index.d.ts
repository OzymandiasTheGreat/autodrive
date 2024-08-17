declare module "hypercore-errors" {
  export default class HypercoreError extends Error {
    code: string
    readonly name: string

    constructor(message: string, code: string, fn?: typeof Error)

    static ASSERTION(message: string): HypercoreError
    static BAD_ARGUMENT(message: string): HypercoreError
    static STORAGE_EMPTY(message: string): HypercoreError
    static STORAGE_CONFLICT(message: string): HypercoreError
    static INVALID_SIGNATURE(message: string): HypercoreError
    static INVALID_CAPABILITY(message: string): HypercoreError
    static INVALID_CHECKSUM(message?: string): HypercoreError
    static INVALID_OPERATION(message: string): HypercoreError
    static INVALID_PROOF(message?: string): HypercoreError
    static BLOCK_NOT_AVAILABLE(message?: string): HypercoreError
    static SNAPSHOT_NOT_AVAILABLE(message?: string): HypercoreError
    static REQUEST_CANCELLED(message?: string): HypercoreError
    static REQUEST_TIMEOUT(message?: string): HypercoreError
    static SESSION_NOT_WRITABLE(message?: string): HypercoreError
    static SESSION_CLOSED(message?: string): HypercoreError
    static BATCH_UNFLUSHED(message?: string): HypercoreError
    static BATCH_ALREADY_EXISTS(message?: string): HypercoreError
    static BATCH_ALREADY_FLUSHED(message?: string): HypercoreError
    static OPLOG_CORRUPT(message?: string): HypercoreError
    static OPLOG_HEADER_OVERFLOW(message?: string): HypercoreError
    static INVALID_OPLOG_VERSION(message?: string): HypercoreError
    static WRITE_FAILED(message?: string): HypercoreError
  }
}
