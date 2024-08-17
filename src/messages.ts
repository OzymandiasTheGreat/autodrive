import c, { type Encoding, type JsonValue } from "compact-encoding"
import { type Blob } from "hyperblobs"

const Blob: Encoding<Blob> = {
  preencode(state, value) {
    c.uint.preencode(state, value.blockOffset)
    c.uint.preencode(state, value.blockLength)
    c.uint.preencode(state, value.byteOffset)
    c.uint.preencode(state, value.byteLength)
  },
  encode(state, value) {
    c.uint.encode(state, value.blockOffset)
    c.uint.encode(state, value.blockLength)
    c.uint.encode(state, value.byteOffset)
    c.uint.encode(state, value.byteLength)
  },
  decode(state) {
    const blockOffset = c.uint.decode(state)
    const blockLength = c.uint.decode(state)
    const byteOffset = c.uint.decode(state)
    const byteLength = c.uint.decode(state)
    return { blockOffset, blockLength, byteOffset, byteLength }
  },
}

export { Blob }

interface File {
  blob?: Blob | null
  executable: boolean
  linkname?: string | null
  metadata?: JsonValue
}

const File: Encoding<File> = {
  preencode(state, value) {
    c.uint8.preencode(state, 0)
    value.blob != null && Blob.preencode(state, value.blob)
    c.bool.preencode(state, !!value.executable)
    value.linkname != null && c.string.preencode(state, value.linkname)
    value.metadata != null && c.json.preencode(state, value.metadata)
  },
  encode(state, value) {
    let flags = 0
    flags |= value?.blob != null ? 1 : 0
    flags |= value?.linkname != null ? 2 : 0
    flags |= value?.metadata != null ? 4 : 0
    c.uint8.encode(state, flags)
    value.blob != null && Blob.encode(state, value.blob)
    c.bool.encode(state, !!value.executable)
    value.linkname != null && c.string.encode(state, value.linkname)
    value.metadata != null && c.json.encode(state, value.metadata)
  },
  decode(state) {
    const flags = c.uint8.decode(state)
    const blob = (flags & 1) === 1 ? Blob.decode(state) : null
    const executable = c.bool.decode(state)
    const linkname = (flags & 2) === 2 ? c.string.decode(state) : null
    const metadata = (flags & 4) === 4 ? c.json.decode(state) : null
    return { blob, executable, linkname, metadata }
  },
}

export interface Entry extends File {
  source: Uint8Array
}

export const Entry: Encoding<Entry> = {
  preencode(state, value) {
    c.fixed32.preencode(state, value.source)
    File.preencode(state, value)
  },
  encode(state, value) {
    c.fixed32.encode(state, value.source)
    File.encode(state, value)
  },
  decode(state) {
    const source = c.fixed32.decode(state)
    const entry = File.decode(state)
    return { ...entry, source }
  },
}

export enum VersionType {
  FILE,
  TOMBSTONE,
}

export interface Version {
  type: VersionType
  source: Uint8Array
}

export const Version: Encoding<Version> = {
  preencode(state, value) {
    c.uint8.preencode(state, value.type)
    c.fixed32.preencode(state, value.source)
  },
  encode(state, value) {
    c.uint8.encode(state, value.type)
    c.fixed32.encode(state, value.source)
  },
  decode(state) {
    const type = c.uint8.decode(state) as VersionType
    const source = c.fixed32.decode(state)
    return { type, source }
  },
}

export enum OperationType {
  Writer,
  Addition,
  Deletion,
  Resolution,
}

export interface WriterOperation {
  type: OperationType.Writer
  key: Uint8Array
  removed?: boolean
  indexer?: boolean
}

const WriterOperation: Encoding<Omit<WriterOperation, "type">> = {
  preencode(state, value) {
    c.fixed32.preencode(state, value.key)
    c.bool.preencode(state, !!value.removed)
    c.bool.preencode(state, !!value.indexer)
  },
  encode(state, value) {
    c.fixed32.encode(state, value.key)
    c.bool.encode(state, !!value.removed)
    c.bool.encode(state, !!value.indexer)
  },
  decode(state) {
    const key = c.fixed32.decode(state)
    const removed = c.bool.decode(state)
    const indexer = c.bool.decode(state)
    return { key, removed, indexer }
  },
}

export interface AdditionOperation extends File {
  type: OperationType.Addition
  path: string
}

const AdditionOperation: Encoding<Omit<AdditionOperation, "type">> = {
  preencode(state, value) {
    c.string.preencode(state, value.path)
    File.preencode(state, value)
  },
  encode(state, value) {
    c.string.encode(state, value.path)
    File.encode(state, value)
  },
  decode(state) {
    const path = c.string.decode(state)
    const entry = File.decode(state)
    return { ...entry, path }
  },
}

export interface DeletionOperation {
  type: OperationType.Deletion
  path: string
}

const DeletionOperation: Encoding<Omit<DeletionOperation, "type">> = {
  preencode(state, value) {
    c.string.preencode(state, value.path)
  },
  encode(state, value) {
    c.string.encode(state, value.path)
  },
  decode(state) {
    const path = c.string.decode(state)
    return { path }
  },
}

export interface ResolutionOperation {
  type: OperationType.Resolution
  path: string
  file?: File | null
}

const ResolutionOperation: Encoding<Omit<ResolutionOperation, "type">> = {
  preencode(state, value) {
    c.uint8.preencode(state, 0)
    c.string.preencode(state, value.path)
    value.file && File.preencode(state, value.file)
  },
  encode(state, value) {
    let flags = 0
    flags |= value.file ? 1 : 0
    c.uint8.encode(state, flags)
    c.string.encode(state, value.path)
    value.file && File.encode(state, value.file)
  },
  decode(state) {
    const flags = c.uint8.decode(state)
    const path = c.string.decode(state)
    const file = flags & 1 ? File.decode(state) : null
    return { path, file }
  },
}

export type Operation = WriterOperation | AdditionOperation | DeletionOperation | ResolutionOperation

const Operations = [WriterOperation, AdditionOperation, DeletionOperation, ResolutionOperation] as const

export const Operation: Encoding<Operation> = {
  preencode(state, value) {
    const operation = Operations[value.type]
    c.uint8.preencode(state, value.type)
    operation.preencode(state, value as any)
  },
  encode(state, value) {
    const operation = Operations[value.type]
    c.uint8.encode(state, value.type)
    operation.encode(state, value as any)
  },
  decode(state) {
    const type = c.uint8.decode(state)
    const operation = Operations[type]
    const value = operation.decode(state)
    return { ...value, type }
  },
}

export type WakeupRequest = Uint8Array
export const WakeupRequest = c.fixed32

export type WakeupResult = boolean
export const WakeupResult = c.bool
