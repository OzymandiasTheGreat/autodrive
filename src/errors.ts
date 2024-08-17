import HypercoreError from "hypercore-errors"

export enum ErrorCode {
  BLOCK_NOT_AVAILABLE = "BLOCK_NOT_AVAILABLE",
  REQUEST_TIMEOUT = "REQUEST_TIMEOUT",
  INVALID_OPERATION = "INVALID_OPERATION",
  INVALID_FILENAME = "INVALID_FILENAME",
  INVALID_SESSION = "INVALID_SESSION",
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  FILE_CONFLICT = "FILE_CONFLICT",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  RECURSIVE_SYMLINK = "RECURSIVE_SYMLINK",
  SESSION_NOT_WRITABLE = "SESSION_NOT_WRITABLE",
  STREAM_CLOSED = "STREAM_CLOSED",
  BAD_ARGUMENT = "BAD_ARGUMENT",
}

export default class AutodriveError extends HypercoreError {
  declare code: ErrorCode

  constructor(message: string, code: ErrorCode) {
    super(message, code)
  }

  static FILE_NOT_FOUND(path: string, message = `File not found at ${path}`): AutodriveError {
    return new AutodriveError(message, ErrorCode.FILE_NOT_FOUND)
  }

  static FILE_CONFLICT(path: string, message = `Conflicting versions at ${path}`): AutodriveError {
    return new AutodriveError(message, ErrorCode.FILE_CONFLICT)
  }

  static PERMISSION_DENIED(path: string, writer: string, message = `Permission denied at ${path} for ${writer}`): AutodriveError {
    return new AutodriveError(message, ErrorCode.PERMISSION_DENIED)
  }

  static RECURSIVE_SYMLINK(message = "Symbolic link leads to itself"): AutodriveError {
    return new AutodriveError(message, ErrorCode.RECURSIVE_SYMLINK)
  }

  static INVALID_FILENAME(name: string, message = `Invalid filename: ${name}`): AutodriveError {
    return new AutodriveError(message, ErrorCode.INVALID_FILENAME)
  }

  static INVALID_SESSION(message: string): AutodriveError {
    return new AutodriveError(message, ErrorCode.INVALID_SESSION)
  }

  static STREAM_CLOSED(message = "Stream is closed"): AutodriveError {
    return new AutodriveError(message, ErrorCode.STREAM_CLOSED)
  }
}
