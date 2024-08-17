import Autobase, { type Apply, type AutocoreSession, type Head, type KeyPair, type Node, type Open, type SystemView } from "autobase"
import b4a from "b4a"
import { type JsonValue } from "compact-encoding"
import type Corestore from "corestore"
import Hyperbee, { type Batch, type Diff, type Item, type Range, type Watcher } from "hyperbee"
import Hyperblobs from "hyperblobs"
import Hypercore, { type Manifest, type Range as CoreRange } from "hypercore"
import { DEFAULT_NAMESPACE } from "hypercore/lib/caps"
import Crypto from "hypercore-crypto"
import MirrorDrive, { type Drive, type Options as MirrorOptions } from "mirror-drive"
import ProtomuxRPC from "protomux-rpc"
import ReadyResource from "ready-resource"
import safetyCatch from "safety-catch"
import { type Duplex, Readable, Writable } from "streamx"
import unixPathResolve from "unix-path-resolve"
import z32 from "z32"
import { BLOBS, FILESYSTEM, WAKEUP_PROTOCOL, Files, conflicts, history } from "./constants"
import AutodriveError, { ErrorCode } from "./errors"
import {
  AdditionOperation,
  Blob,
  DeletionOperation,
  Entry,
  Operation,
  OperationType,
  ResolutionOperation,
  Version,
  VersionType,
  WakeupRequest,
  WakeupResult,
  WriterOperation,
} from "./messages"
import CorePool from "./pool"

export { type Blob, type Entry, ErrorCode }

export interface Options {
  keyPair?: KeyPair
  ackInterval?: number
  encryptionKey?: Uint8Array | null
  fastForward?: boolean
  namespace?: (source: Uint8Array) => Uint8Array
}

export default class Autodrive extends ReadyResource<{
  /** Forwarded from Autobase */
  "update": []
  /** Forwarded from Autobase, as well as custom errors in apply() */
  "error": [Error | null | undefined]
  /** Forwarded from Autobase */
  "writable": []
  /** Forwarded from Autobase */
  "unwritable": []
  /** Hyperdrive compat */
  "blobs": [Hyperblobs]
  /** Hyperdrive compat */
  "content-key": [Uint8Array]
  /** Emitted from apply() when conflicts detected, [path, number of conflicts] */
  "conflict": [string]
}> {
  protected _base: Autobase<Hyperbee<unknown, unknown>, Operation>
  protected _store: Corestore
  protected _blobs: Hyperblobs | null = null
  protected _pool = new CorePool()
  protected _rpc: Set<ProtomuxRPC<{ wakeup: [WakeupRequest, WakeupResult] }>> = new Set()
  protected _root: Autodrive | null = null
  protected _db: Hyperbee<unknown, unknown> | null
  protected _batch: Batch<unknown, unknown> | null
  protected _queue: Operation[] = []
  protected _namespace: (source: Uint8Array) => Uint8Array
  protected _onErrorBound: (err?: Error | null) => void
  protected _onUpdateBound: () => void

  constructor(
    store: Corestore,
    bootstrap?: string | Uint8Array | null | Options,
    options?: Options | null,
    _internal?: { root?: Autodrive | null; db?: Hyperbee<unknown, unknown>; batch?: Batch<unknown, unknown> },
  ) {
    super()

    if (bootstrap && typeof bootstrap !== "string" && !b4a.isBuffer(bootstrap)) {
      options = bootstrap
      bootstrap = null
    }

    this._base =
      _internal?.root?._base ??
      new Autobase(store, bootstrap!, {
        ...options,
        open: this._baseOpen.bind(this),
        apply: this._baseApply.bind(this),
        valueEncoding: Operation,
      })
    this._store = this._base.store
    this._namespace = options?.namespace ?? namespace
    this._db = _internal?.db ?? null
    this._batch = _internal?.batch ?? null

    if (_internal?.root) {
      this._root = _internal.root
      this._pool = this._root._pool
      this._rpc = this._root._rpc
    }

    this._onErrorBound = this._onError.bind(this)
    this._onUpdateBound = this._onUpdate.bind(this)
    this._base.on("error", this._onErrorBound)
    this._base.on("update", this._onUpdateBound)
    this._base.on("writable", async () => {
      if (!this._blobs) {
        const manifest = this._generateBlobsManifest()!
        const core = this.store.get({
          manifest,
          encryptionKey: this.encryptionKey,
          compat: false,
          keyPair: this.keyPair,
        })
        await core.ready()
        this._pool.linger(this.local!.keyPair.publicKey, core, false)

        this._blobs = new Hyperblobs(core)

        this.emit("blobs", this._blobs)
        this.emit("content-key", core.key)
      }
    })
  }

  get id(): string | null {
    return this.key && z32.encode(this.key)
  }

  get key(): Uint8Array | null {
    try {
      return this._base.key
    } catch {
      return null
    }
  }

  get discoveryKey(): Uint8Array | null {
    try {
      return this._base.discoveryKey
    } catch {
      return null
    }
  }

  get contentKey(): Uint8Array | null {
    return this.blobs?.core.key ?? null
  }

  get keyPair(): KeyPair | null {
    return this.local?.keyPair ?? null
  }

  get encrypted(): boolean {
    return this._base.encrypted
  }

  get encryptionKey(): Uint8Array | null {
    return this._base.encryptionKey
  }

  get base(): Autobase<Hyperbee<unknown, unknown>, Operation> {
    return this._base
  }

  get local(): Hypercore<Operation> | null {
    return this._base.local
  }

  get system(): SystemView | null {
    return this._base.system
  }

  get db(): Hyperbee<unknown, unknown> | Batch<unknown, unknown> {
    return this._batch ?? this._db ?? this._base.view
  }

  get core(): AutocoreSession<unknown> {
    return this._base.view.core as unknown as AutocoreSession<unknown>
  }

  get blobs(): Hyperblobs | null {
    return this._blobs
  }

  get store(): Corestore {
    return this._store
  }

  get corestore(): Corestore {
    // Hyperdrive compat
    return this._store
  }

  get version(): number {
    return this.db.version
  }

  get writable(): boolean {
    return this._base.writable
  }

  get readable(): boolean {
    return true
  }

  get supportsMetadata(): boolean {
    return true
  }

  get namespace(): Uint8Array | null {
    return this.local && this._namespace(this.local.keyPair.publicKey)
  }

  get updating(): boolean {
    return this._base.updating
  }

  heads(): Head[] {
    return this._base.heads()
  }

  protected async _open(): Promise<void> {
    if (this._root) {
      await this._root.ready()
      this._blobs = this._root._blobs && !this._root._blobs.core.closing ? new Hyperblobs(this._root._blobs.core.session()) : null
    } else {
      await this._base.ready()
      await this._base.view.ready()
    }
  }

  protected async _close(): Promise<void> {
    if (this._db || this._batch) {
      this._base.off("error", this._onErrorBound)
      this._base.off("update", this._onUpdateBound)
      return (this._db ?? this._batch)?.close()
    }
    await this._base.view.close()
    await this._base.close()
    await Promise.all([...this._rpc].map((rpc) => rpc.end()))
    await this._pool.clear()
  }

  protected _generateBlobsManifest(): Manifest | null {
    return generateContentManifest(this.local?.manifest, this.local?.key)
  }

  protected async _getCore(source: Uint8Array): Promise<Hypercore<unknown> | null> {
    const writer = this.store.get({ manifest: generateWriterManifest(source), compat: false })
    await writer.ready()
    const manifest = generateContentManifest(writer.manifest, writer.key)!
    if (!manifest) return null
    const core = this.store.get({
      manifest,
      encryptionKey: this.encryptionKey,
      compat: false,
    })
    await core.ready()
    this._pool.linger(source, core, true)
    return core
  }

  protected _onError(err?: Error | null): void {
    this.emit("error", err)
  }

  protected _onUpdate(): void {
    this.emit("update")
  }

  protected _baseOpen: Open<Hyperbee<unknown, unknown>> = (store) => {
    const core = store.get(FILESYSTEM)
    const bee = new Hyperbee(core, { extension: false })
    return bee
  }

  protected _baseApply: Apply<Hyperbee<unknown, unknown>, Operation> = async (nodes, view, base) => {
    const db = this._batch ?? view.batch()
    for (const node of nodes) {
      const type = node.value.type
      switch (type) {
        case OperationType.Writer: {
          await this._writerOp(node as Node<WriterOperation>, base)
          break
        }
        case OperationType.Addition: {
          await this._additionOp(node as Node<AdditionOperation>, db)
          break
        }
        case OperationType.Deletion: {
          await this._deletionOp(node as Node<DeletionOperation>, db)
          break
        }
        case OperationType.Resolution: {
          await this._resolutionOp(node as Node<ResolutionOperation>, db)
          break
        }
        default: {
          this.emit("error", AutodriveError.INVALID_OPERATION(type))
          break
        }
      }
    }
    await db.flush()
  }

  protected async _writerOp(
    { value: { key, indexer, removed } }: Node<WriterOperation>,
    base: Autobase<Hyperbee<unknown, unknown>, Operation>,
  ): Promise<void> {
    if (removed) {
      await base.removeWriter(key)
    } else {
      await base.addWriter(key, { indexer })
    }
  }

  protected async _additionOp(
    { from, heads, value: { path, ...file } }: Node<AdditionOperation>,
    db: Batch<unknown, unknown>,
  ): Promise<void> {
    const source = from.manifest.signers[0].publicKey
    const record = await db.peek(intRange(), { reverse: true, keyEncoding: history(path), valueEncoding: Version })

    if (record && !b4a.equals(this._namespace(source), this._namespace(record.value.source))) {
      this.emit("error", AutodriveError.PERMISSION_DENIED(path, z32.encode(source)))
      return
    }

    const conflict = await db.peek(intRange(), { keyEncoding: conflicts(path), valueEncoding: Entry })
    const hasConflict = !!conflict || (!!record && !b4a.equals(source, record.value.source) && !same(heads, this.heads()))

    if (hasConflict) {
      await db.put(db.version, { ...file, source }, { keyEncoding: conflicts(path), valueEncoding: Entry })
      this.emit("conflict", path)
    } else {
      await db.put(path, { ...file, source }, { keyEncoding: Files, valueEncoding: Entry })
      await db.put(db.version - 1, { type: VersionType.FILE, source }, { keyEncoding: history(path), valueEncoding: Version })
    }
  }

  protected async _deletionOp({ from, heads, value: { path } }: Node<DeletionOperation>, db: Batch<unknown, unknown>): Promise<void> {
    const source = from.manifest.signers[0].publicKey
    const record = await db.peek(intRange(), { reverse: true, keyEncoding: history(path), valueEncoding: Version })

    if (record?.value.type === VersionType.TOMBSTONE) {
      this.emit("error", AutodriveError.FILE_NOT_FOUND(path))
      return
    }

    if (record && !b4a.equals(this._namespace(source), this._namespace(record.value.source))) {
      this.emit("error", AutodriveError.PERMISSION_DENIED(path, z32.encode(source)))
      return
    }

    const conflict = await db.peek(intRange(), { keyEncoding: conflicts(path), valueEncoding: Entry })
    const hasConflict = !!conflict || (!!record && !b4a.equals(source, record.value.source) && !same(heads, this.heads()))

    if (hasConflict) {
      await db.put(db.version, { source, executable: false }, { keyEncoding: conflicts(path), valueEncoding: Entry })
      this.emit("conflict", path)
    } else {
      if (record) {
        await db.del(path, { keyEncoding: Files })
        await db.put(db.version - 1, { type: VersionType.TOMBSTONE, source }, { keyEncoding: history(path), valueEncoding: Version })
      }
    }
  }

  protected async _resolutionOp({ from, value: { path, file } }: Node<ResolutionOperation>, db: Batch<unknown, unknown>): Promise<void> {
    const source = from.manifest.signers[0].publicKey
    const record = await db.peek(intRange(), { keyEncoding: history(path), valueEncoding: Version })

    if (!record) {
      // No conflict to resolve, ignore
      return
    }

    if (!b4a.equals(this._namespace(source), this._namespace(record.value.source))) {
      this.emit("error", AutodriveError.PERMISSION_DENIED(path, z32.encode(source)))
      return
    }

    for await (const conflict of db.createReadStream({ keyEncoding: conflicts(path), valueEncoding: Entry })) {
      await db.del(conflict.key, { keyEncoding: conflicts(path) })
    }
    if (file) {
      await db.put(path, { ...file, source }, { keyEncoding: Files, valueEncoding: Entry })
    } else {
      await db.del(path, { keyEncoding: Files })
    }
    await db.put(
      db.version - 1,
      { type: file ? VersionType.FILE : VersionType.TOMBSTONE, source },
      { keyEncoding: history(path), valueEncoding: Version },
    )
  }

  protected async _wakeup(source: Uint8Array): Promise<boolean> {
    const promises = [...this._rpc].map((rpc) =>
      rpc.request("wakeup", source, { requestEncoding: WakeupRequest, responseEncoding: WakeupResult }),
    )
    return Promise.all(promises)
      .then((responses) => {
        return responses.some((response) => response)
      })
      .catch((err) => {
        safetyCatch(err)
        return false
      })
  }

  protected async _entry(pathOrSeq: string | number, options?: { wait?: boolean; timeout?: number }): Promise<Item<string, Entry> | null> {
    if (!this.opened) await this.ready()

    if (typeof pathOrSeq !== "string" && typeof pathOrSeq !== "number") return pathOrSeq

    if (typeof pathOrSeq === "number") {
      try {
        return this.db.getBySeq(pathOrSeq, { ...options, keyEncoding: Files, valueEncoding: Entry })
      } catch (err: any) {
        safetyCatch(err)
        return null
      }
    }

    const path = std(pathOrSeq, false)

    const conflict = await this.db.peek(intRange(), { keyEncoding: conflicts(path), valueEncoding: Entry })
    if (conflict) {
      throw AutodriveError.FILE_CONFLICT(path)
    }

    const entry = await this.db.get(path, { ...options, keyEncoding: Files, valueEncoding: Entry })
    return entry
  }

  protected _checkout(snapshot: Hyperbee<unknown, unknown>): Autodrive {
    return new Autodrive(this.store, this.key, { encryptionKey: this.encryptionKey }, { root: this, db: snapshot })
  }

  async getBlobs(source?: Uint8Array): Promise<Hyperblobs | null> {
    if (!this.opened) await this.ready()

    if (!source && !this.local) return null

    if (this.local && (!source || b4a.equals(source, this.local.key))) {
      if (this._blobs) {
        return this._blobs
      }
      const manifest = this._generateBlobsManifest()!
      const core = this.store.get({
        manifest,
        encryptionKey: this.encryptionKey,
        compat: false,
        keyPair: this.local.keyPair,
      })
      await core.ready()
      this._pool.linger(this.local.keyPair.publicKey, core, false)

      this._blobs = new Hyperblobs(core)

      this.emit("blobs", this._blobs)
      this.emit("content-key", core.key)

      return this._blobs
    }

    if (!source) return null

    const core = await this._getCore(source)
    return core && new Hyperblobs(core)
  }

  async addWriter(key: Uint8Array, indexer = false): Promise<void> {
    if (!this.opened) await this.ready()
    await this.base.append({
      type: OperationType.Writer,
      key,
      indexer,
    })
  }

  async removeWriter(key: Uint8Array): Promise<void> {
    if (!this.opened) await this.ready()
    await this.base.append({
      type: OperationType.Writer,
      key,
      removed: true,
    })
  }

  async update(options?: { wait?: boolean }): Promise<void> {
    if (!this.opened) await this.ready()
    return this.base.update(options)
  }

  replicate(isInitiator: boolean, options?: any): Duplex<unknown, unknown> {
    const replicator = this.store.replicate(isInitiator, options)
    const rpc = new ProtomuxRPC<{ wakeup: [WakeupRequest, WakeupResult] }>(Hypercore.getProtocolMuxer(replicator), {
      protocol: WAKEUP_PROTOCOL,
    })
    rpc.respond("wakeup", { requestEncoding: WakeupRequest, responseEncoding: WakeupResult }, async (source) => {
      let core
      try {
        core = await this._getCore(source)
      } catch (err: any) {
        safetyCatch(err)
        return false
      }
      return !!core
    })
    replicator.on("error", () => rpc.end().then(() => this._rpc.delete(rpc)))
    replicator.on("close", () => rpc.end().then(() => this._rpc.delete(rpc)))
    this._rpc.add(rpc)
    return replicator
  }

  async getBlobsLength(checkout: number, source?: Uint8Array) {
    if (!this.opened) await this.ready()

    if (!checkout) checkout = this.version

    const c = this.base.view.checkout(checkout)

    try {
      return await getBlobsLength(c, source ?? this.local!.keyPair.publicKey)
    } finally {
      await c.close()
    }
  }

  async truncate(version: number, { blobs = -1 } = {}): Promise<void> {
    if (!this.opened) await this.ready()

    if (version > this.core.length) {
      throw AutodriveError.BAD_ARGUMENT("Bad truncation length")
    }

    const blobsVersion = blobs === -1 ? await this.getBlobsLength(version) : blobs

    if (blobsVersion > this.blobs!.core.length) {
      throw AutodriveError.BAD_ARGUMENT("Bad truncation length")
    }

    await this.core.truncate(version)
    await this.blobs!.core.truncate(blobsVersion)
  }

  findingPeers(): () => void {
    return this.store.findingPeers()
  }

  checkout(version: number): Autodrive {
    return this._checkout(this.base.view.checkout(version))
  }

  batch(): Autodrive {
    return new Autodrive(
      this.store,
      this.key,
      { encryptionKey: this.encryptionKey },
      { root: this, batch: this._db?.batch() ?? this.base.view.batch() },
    )
  }

  async flush(): Promise<void> {
    if (!this._batch) throw AutodriveError.INVALID_SESSION("Can only flush batch")
    if (this._queue.length) {
      await this.base.append(this._queue)
    } else {
      await this._batch.flush()
    }
    await this.blobs?.core.close()
    this._queue = []
  }

  mirror(dest: Drive, options?: MirrorOptions): MirrorDrive {
    return new MirrorDrive(this, dest, options)
  }

  async entry(
    pathOrSeq: string | number,
    options?: { follow?: boolean; wait?: boolean; timeout?: number },
  ): Promise<Item<string, Entry> | null> {
    if (options?.follow !== true) return this._entry(pathOrSeq, options)

    for (let i = 0; i < 16; i++) {
      const entry = await this._entry(pathOrSeq, options)
      if (!entry || !entry.value.linkname) return entry

      pathOrSeq = unixPathResolve(entry.key, entry.value.linkname!)
    }

    throw AutodriveError.RECURSIVE_SYMLINK()
  }

  async get(
    pathSeqOrEntry: string | number | Entry,
    options?: { follow?: boolean; wakeup?: boolean; wait?: boolean; timeout?: number },
  ): Promise<Uint8Array | null> {
    let item: { source: Uint8Array; blob: Blob }
    if (typeof pathSeqOrEntry === "string" || typeof pathSeqOrEntry === "number") {
      const entry = await this.entry(pathSeqOrEntry, options)

      if (!entry?.value.blob) return null

      item = entry.value as any
    } else if (pathSeqOrEntry.blob) {
      item = pathSeqOrEntry as any
    } else {
      return null
    }
    const blobs = await this.getBlobs(item.source)
    if (!blobs) return null
    let buffer = await blobs.get(item.blob, { ...options, wait: false }).catch((err) => {
      safetyCatch(err)
      return null
    })
    if (!buffer && options?.wakeup !== false) {
      if (await this._wakeup(item.source)) {
        buffer = await blobs.get(item.blob, options)
      }
    }
    if (!buffer) throw options?.timeout ? AutodriveError.REQUEST_TIMEOUT() : AutodriveError.BLOCK_NOT_AVAILABLE()
    return buffer
  }

  async put(
    path: string,
    data: string | Uint8Array,
    { executable = false, metadata = null }: { executable?: boolean; metadata?: JsonValue } = {},
  ): Promise<void> {
    if (!this.opened) await this.ready()

    if (!this.writable) throw AutodriveError.SESSION_NOT_WRITABLE()

    path = std(path, false)
    const conflict = await this.db.peek(intRange(), { keyEncoding: conflicts(path), valueEncoding: Entry })
    if (conflict) {
      throw AutodriveError.FILE_CONFLICT(path)
    }

    const record = await this.db.peek(intRange(), { reverse: true, keyEncoding: history(path), valueEncoding: Version })
    if (record && !b4a.equals(this.namespace!, this._namespace(record.value.source))) {
      throw AutodriveError.PERMISSION_DENIED(path, z32.encode(this.local!.keyPair.publicKey))
    }

    const blob = await this.blobs!.put(b4a.from(data))
    const op: Operation = {
      type: OperationType.Addition,
      path,
      blob,
      executable,
      metadata,
    }
    if (this._batch) {
      this._queue.push(op)
    } else {
      await this.base.append(op)
    }
  }

  async del(path: string, options?: { clear?: boolean; history?: boolean; diff?: false }): Promise<void>
  async del(path: string, options: { clear?: boolean; history?: boolean; diff: true }): Promise<{ blocks: number }>
  async del(path: string, options?: { clear?: boolean; history?: boolean; diff?: boolean }): Promise<{ blocks: number } | void> {
    if (!this.opened) await this.ready()

    if (!this.writable) throw AutodriveError.SESSION_NOT_WRITABLE()

    path = std(path, false)
    const record = await this.db.peek(intRange(), { reverse: true, keyEncoding: history(path), valueEncoding: Version })
    if (!record || record.value.type === VersionType.TOMBSTONE) {
      throw AutodriveError.FILE_NOT_FOUND(path)
    }

    if (record && !b4a.equals(this.namespace!, this._namespace(record.value.source))) {
      throw AutodriveError.PERMISSION_DENIED(path, z32.encode(this.local!.keyPair.publicKey))
    }

    const conflict = await this.db.peek(intRange(), { keyEncoding: conflicts(path), valueEncoding: Entry })
    if (conflict) {
      throw AutodriveError.FILE_CONFLICT(path)
    }

    const cleared = { blocks: 0 }
    if (options?.clear) {
      if (options.history) {
        for await (const version of this.db.createReadStream({ keyEncoding: history(path), valueEncoding: Version })) {
          if (version.value.type === VersionType.FILE) {
            try {
              const entry = await this.entry(version.key, { wait: false })
              if (entry?.value.blob) {
                const blobs = await this.getBlobs(entry.value.source)
                const diff = await blobs?.clear(entry.value.blob, options)
                if (diff) {
                  cleared.blocks += diff.blocks
                }
              }
            } catch (err: any) {
              safetyCatch(err)
            }
          }
        }
      } else {
        try {
          const entry = await this.entry(record.key, { wait: false })
          if (entry?.value.blob) {
            const blobs = await this.getBlobs(entry.value.source)
            const diff = await blobs?.clear(entry.value.blob, options)
            if (diff) {
              cleared.blocks += diff.blocks
            }
          }
        } catch (err: any) {
          safetyCatch(err)
        }
      }
    }

    const op: Operation = {
      type: OperationType.Deletion,
      path,
    }
    if (this._batch) {
      this._queue.push(op)
    } else {
      await this.base.append(op)
    }

    return options?.diff ? cleared : undefined
  }

  async resolve(path: string, data?: string | Uint8Array | Entry, options?: { executable?: boolean; metadata?: JsonValue }): Promise<void> {
    if (!this.opened) await this.ready()

    if (!this.writable) throw AutodriveError.SESSION_NOT_WRITABLE()

    path = std(path, false)
    const conflict = await this.db.peek(intRange(), { keyEncoding: conflicts(path), valueEncoding: Entry })

    if (!conflict) return // No conflict, ignore

    if (!b4a.equals(this.namespace!, this._namespace(conflict.value.source))) {
      throw AutodriveError.PERMISSION_DENIED(path, z32.encode(this.local!.keyPair.publicKey))
    }

    let op: Operation
    if (!data) {
      op = {
        type: OperationType.Resolution,
        path,
      }
    } else if (typeof data === "string" || b4a.isBuffer(data)) {
      const blob = await this.blobs!.put(b4a.from(data))
      op = {
        type: OperationType.Resolution,
        path,
        file: {
          blob,
          executable: !!options?.executable,
          metadata: options?.metadata,
        },
      }
    } else {
      op = {
        type: OperationType.Resolution,
        path,
        file: data,
      }
    }

    if (this._batch) {
      this._queue.push(op)
    } else {
      await this.base.append(op)
    }
  }

  createReadStream(
    path: string,
    options?: { start?: number; end?: number; length?: number; follow?: boolean; wakeup?: boolean; wait?: boolean; timeout?: number },
  ): Readable<Uint8Array>
  createReadStream(
    seq: number,
    options?: { start?: number; end?: number; length?: number; follow?: boolean; wakeup?: boolean; wait?: boolean; timeout?: number },
  ): Readable<Uint8Array>
  createReadStream(
    entry: Entry,
    options?: { start?: number; end?: number; length?: number; follow?: boolean; wakeup?: boolean; wait?: boolean; timeout?: number },
  ): Readable<Uint8Array>
  createReadStream(
    entry: Item<string, Entry>,
    options?: { start?: number; end?: number; length?: number; follow?: boolean; wakeup?: boolean; wait?: boolean; timeout?: number },
  ): Readable<Uint8Array>
  createReadStream(
    pathSeqOrEntry: string | number | Entry | Item<string, Entry>,
    options?: { start?: number; end?: number; length?: number; follow?: boolean; wakeup?: boolean; wait?: boolean; timeout?: number },
  ): Readable<Uint8Array> {
    const self = this

    let destroyed = false
    let rs: Readable<Uint8Array>

    return new Readable({
      open(callback) {
        let item: { source: Uint8Array; blob: Blob }

        const onentry = (entry: Item<string, Entry> | null) => {
          if (!entry) {
            return callback(AutodriveError.FILE_NOT_FOUND(typeof pathSeqOrEntry === "string" ? pathSeqOrEntry : "unknown"))
          }
          item = entry.value as any
          self.getBlobs(entry.value.source).then(onblobs).catch(callback)
        }

        const onblobs = (blobs?: Hyperblobs | null) => {
          if (destroyed) return callback(null)

          if (!blobs || !item.blob) {
            this.push(null)
            return callback(null)
          }

          rs = blobs.createReadStream(item.blob, options)

          rs.on("data", (data) => {
            if (!this.push(data)) rs.pause()
          })

          rs.on("end", () => {
            this.push(null)
          })

          rs.on("error", (err) => {
            this.destroy(err)
          })

          callback(null)
        }

        if (typeof pathSeqOrEntry !== "string" && typeof pathSeqOrEntry !== "number") {
          item = "blob" in pathSeqOrEntry ? pathSeqOrEntry : (pathSeqOrEntry as any).value
          self.getBlobs(item.source).then(onblobs).catch(callback)
        } else {
          self.entry(pathSeqOrEntry, options).then(onentry).catch(callback)
        }
      },
      read(callback) {
        rs.resume()
        callback(null)
      },
      predestroy() {
        destroyed = true
        if (rs) rs.destroy()
      },
    })
  }

  createWriteStream(
    path: string,
    { executable = false, metadata = null, resolve = false }: { executable?: boolean; metadata?: JsonValue; resolve?: boolean } = {},
  ): Writable<Uint8Array> {
    const self = this

    let destroyed = false
    let ws: Writable<Uint8Array> & { id: Blob }
    let ondrain: ((err?: Error | null) => void) | null = null
    let onfinish: ((err?: Error | null) => void) | null = null

    return new Writable({
      open(callback) {
        const onblobs = (blobs?: Hyperblobs | null) => {
          if (destroyed || !blobs) return callback(null)

          ws = blobs.createWriteStream()

          ws.on("error", (err) => {
            this.destroy(err)
          })

          ws.on("close", () => {
            const err = AutodriveError.STREAM_CLOSED()
            callOndrain(err)
            callOnfinish(err)
          })

          ws.on("finish", () => callOnfinish(null))

          ws.on("drain", () => callOndrain(null))

          callback(null)
        }

        const onconflict = (conflict: Item<number, Entry> | null) => {
          if (resolve !== true && conflict) {
            return callback(AutodriveError.FILE_CONFLICT(path))
          }
          self.getBlobs().then(onblobs).catch(callback)
        }

        self.db
          .peek(intRange(), { keyEncoding: conflicts(path), valueEncoding: Entry })
          .then(onconflict)
          .catch((err) => {
            safetyCatch(err)
            onconflict(null)
          })
      },
      write(data, callback) {
        if (ws.write(data) === true) return callback(null)
        ondrain = callback
      },
      final(callback) {
        onfinish = callback
        ws.end()
      },
      predestroy() {
        destroyed = true
        if (ws) ws.destroy()
      },
    })

    function callOnfinish(err?: Error | null) {
      if (!onfinish) return

      const callback = onfinish
      onfinish = null

      if (err) return callback(err)

      let op: Operation
      path = std(path, false)
      if (resolve === true) {
        op = {
          type: OperationType.Resolution,
          path,
          file: {
            blob: ws.id,
            executable,
            metadata,
          },
        }
      } else {
        op = {
          type: OperationType.Addition,
          path,
          blob: ws.id,
          executable,
          metadata,
        }
      }

      if (self._batch) {
        self._queue.push(op)
        callback(null)
      } else {
        self.base
          .append(op)
          .then(() => callback(null))
          .catch(callback)
      }
    }

    function callOndrain(err?: Error | null) {
      if (ondrain) {
        const callback = ondrain
        ondrain = null
        callback(err)
      }
    }
  }

  async symlink(path: string, dest: string, options?: { executable?: boolean; metadata?: JsonValue; resolve?: boolean }): Promise<void> {
    let op: Operation
    path = std(path, false)

    if (options?.resolve === true) {
      op = {
        type: OperationType.Resolution,
        path,
        file: {
          executable: !!options.executable,
          linkname: dest,
          metadata: options.metadata,
        },
      }
    } else {
      op = {
        type: OperationType.Addition,
        path,
        executable: !!options?.executable,
        linkname: dest,
        metadata: options?.metadata,
      }
    }

    if (this._batch) {
      this._queue.push(op)
    } else {
      await this.base.append(op)
    }
  }

  async exists(path: string, options?: { wait?: boolean; timeout?: number }): Promise<boolean> {
    const entry = await this.entry(path, options)
    return entry != null
  }

  entries(range?: Range<string>, options?: { reverse?: boolean; limit?: number }): Readable<Item<string, Entry>> {
    const self = this
    let rs: Readable<Item<string, Entry>>

    return new Readable({
      open(callback) {
        rs = self.db.createReadStream(range, { ...options, keyEncoding: Files, valueEncoding: Entry })
        rs.on("error", (err) => this.destroy(err))
        rs.on("end", () => this.push(null))
        rs.on("data", (entry) => {
          if (!this.push(entry)) rs.pause()
        })
        callback(null)
      },
      read(callback) {
        rs.resume()
        callback(null)
      },
      predestroy() {
        if (rs) rs.destroy()
      },
    })
  }

  list(folder?: string | { recursive?: boolean }, options?: { recursive?: boolean }): Readable<Item<string, Entry>> {
    if (typeof folder === "object") return this.list(undefined, folder)

    folder = std((folder as string) || "/", true)

    if (options?.recursive === false) return shallowReadStream(this.db, folder, { keys: false })

    return this.entries(prefixRange(folder))
  }

  readdir(folder?: string): Readable<string> {
    folder = std(folder || "/", true)
    return shallowReadStream(this.db, folder, { keys: true })
  }

  conflicts(path: string, options?: { limit?: number; reverse?: boolean }): Readable<Entry> {
    const self = this
    let rs: Readable<Item<number, Entry>>

    return new Readable({
      open(callback) {
        rs = self.db.createReadStream({ ...options, keyEncoding: conflicts(std(path, false)), valueEncoding: Entry })
        rs.on("error", (err) => this.destroy(err))
        rs.on("end", () => this.push(null))
        rs.on("data", (entry) => {
          if (!this.push(entry.value)) rs.pause()
        })
        callback(null)
      },
      read(callback) {
        rs.resume()
        callback(null)
      },
      predestroy() {
        if (rs) rs.destroy()
      },
    })
  }

  history(path: string, options?: { limit?: number; reverse?: boolean }): Readable<Item<string, Entry | null>> {
    const self = this
    let rs: Readable<Item<number, Version>>
    path = std(path, false)

    return new Readable({
      open(callback) {
        rs = self.db.createReadStream({ ...options, reverse: !options?.reverse, keyEncoding: history(path), valueEncoding: Version })
        rs.on("error", (err) => this.destroy(err))
        rs.on("end", () => this.push(null))
        rs.on("data", async (item) => {
          let entry: Item<string, Entry | null>
          if (item.value.type === VersionType.TOMBSTONE) {
            entry = { seq: item.key, key: path, value: null }
          } else {
            const file = await self.db.getBySeq(item.key, { keyEncoding: Files, valueEncoding: Entry })
            if (!file) return
            entry = { seq: item.key, key: path, value: file.value }
          }
          if (!this.push(entry)) rs.pause()
        })
        callback(null)
      },
      read(callback) {
        rs.resume()
        callback(null)
      },
      predestroy() {
        if (rs) rs.destroy()
      },
    })
  }

  compare(a: Item<string, Entry>, b: Item<string, Entry>): number {
    const diff = a.seq - b.seq
    return diff > 0 ? 1 : diff < 0 ? -1 : 0
  }

  diff(version: number, folder?: string | { limit?: number }, options?: { limit?: number }): Readable<Diff<string, Entry>> {
    if (folder && !options && typeof folder === "object") return this.diff(version, undefined, folder)

    folder = std((folder as string) || "/", true)

    return this.base.view.createDiffStream(version, prefixRange(folder), { ...options, keyEncoding: Files, valueEncoding: Entry })
  }

  watch(folder: string): Watcher<unknown, unknown, Autodrive> {
    folder = std(folder || "/", true)

    if (this._batch || this._db) {
      throw AutodriveError.INVALID_SESSION("watch() can only be called from main session")
    }

    return this.base.view.watch(prefixRange(folder), {
      keyEncoding: Files as any,
      map: (snapshot) => this._checkout(snapshot),
    })
  }

  async download(folder?: string | { recursive?: boolean }, options?: { recursive?: boolean }): Promise<void> {
    if (typeof folder === "object") return this.download(undefined, folder)

    const downloads = []
    const entry = !folder || folder.endsWith("/") ? null : await this.entry(folder)

    if (entry) {
      const { blob, source } = entry.value
      if (!blob) return
      const blobs = await this.getBlobs(source)
      await blobs?.core.download({ start: blob.blockOffset, length: blob.blockLength }).downloaded()
      return
    }

    for await (const entry of this.list(folder, options)) {
      const { blob, source } = entry.value
      if (!blob) continue

      const blobs = await this.getBlobs(source)
      if (!blobs) continue

      downloads.push(blobs?.core.download({ start: blob.blockOffset, length: blob.blockLength }))
    }

    const promises = downloads.map((dl) => dl.downloaded())
    await Promise.allSettled(promises)
  }

  async downloadDiff(version: number, folder?: string, options?: { limit?: number }): Promise<void> {
    const downloads = []

    for await (const entry of this.diff(version, folder, options)) {
      if (!entry.left) continue

      const { blob, source } = entry.left.value
      if (!blob) continue

      const blobs = await this.getBlobs(source)
      if (!blobs) continue

      downloads.push(blobs.core.download({ start: blob.blockOffset, length: blob.blockLength }))
    }

    const promises = downloads.map((dl) => dl.downloaded())
    await Promise.allSettled(promises)
  }

  async downloadRange(blobRanges: (CoreRange & { source: Uint8Array })[] = []): Promise<void> {
    if (!this.opened) await this.ready()

    const downloads = []

    for (const range of blobRanges) {
      const blobs = await this.getBlobs(range.source)
      if (!blobs) continue
      downloads.push(blobs.core.download(range))
    }

    const promises = downloads.map((dl) => dl.downloaded())
    await Promise.allSettled(promises)
  }

  async clear(pathSeqOrEntry: string | number | Entry, options?: { diff?: false; history?: boolean }): Promise<void>
  async clear(pathSeqOrEntry: string | number | Entry, options?: { diff?: true; history?: boolean }): Promise<{ blocks: number }>
  async clear(
    pathSeqOrEntry: string | number | Entry,
    options?: { diff?: boolean; history?: boolean },
  ): Promise<{ blocks: number } | void> {
    if (!this.opened) await this.ready()

    const versions: { source: Uint8Array; blob?: Blob | null }[] = []
    if (typeof pathSeqOrEntry === "string") {
      const path = std(pathSeqOrEntry, false)
      try {
        const entry = await this.entry(path, { wait: false })
        if (entry?.value.blob) {
          versions.push(entry.value)
        }
      } catch (err: any) {
        safetyCatch(err)
      }
      if (options?.history) {
        for await (const version of this.db.createReadStream({ keyEncoding: history(path), valueEncoding: Version })) {
          if (version.value.type === VersionType.TOMBSTONE) continue
          try {
            const entry = await this.entry(version.key, { wait: false })
            if (entry?.value.blob) {
              versions.push(entry.value)
            }
          } catch (err: any) {
            safetyCatch(err)
          }
        }
      }
    } else if (typeof pathSeqOrEntry === "number") {
      try {
        const entry = await this.entry(pathSeqOrEntry, { wait: false })
        if (entry?.value.blob) {
          versions.push(entry.value)
        }
      } catch (err: any) {
        safetyCatch(err)
      }
    } else {
      versions.push(pathSeqOrEntry)
    }

    const cleared = { blocks: 0 }
    if (!versions.length) return options?.diff ? cleared : undefined

    for (const item of versions) {
      try {
        const blobs = await this.getBlobs(item.source)
        const diff = await blobs?.clear(item.blob!, options)

        if (diff) {
          cleared.blocks += diff.blocks
        }
      } catch (err: any) {
        safetyCatch(err)
      }
    }

    return options?.diff ? cleared : undefined
  }

  async clearAll(options?: { diff?: false; history?: boolean }): Promise<void>
  async clearAll(options?: { diff?: true; history?: boolean }): Promise<{ blocks: number }>
  async clearAll(options?: { diff?: boolean; history?: boolean }): Promise<{ blocks: number } | void> {
    if (!this.opened) await this.ready()

    const cleared = { blocks: 0 }

    if (options?.history) {
      for await (const { key } of this.system!.list()) {
        try {
          const writer = this.store.get({ key, compat: false, createIfMissing: false })
          if (writer) {
            await writer.ready()
            const publicKey = writer.core.header.manifest.signers[0].publicKey
            const blobs = await this.getBlobs(publicKey)
            const diff = await blobs?.core.clear(0, blobs.core.length, options)
            if (diff) {
              cleared.blocks += diff.blocks
            }
            await writer.close()
          }
        } catch (err: any) {
          safetyCatch(err)
        }
      }
    } else {
      for await (const entry of this.db.createReadStream({ gt: "/", lt: "0" }, { keyEncoding: Files, valueEncoding: Entry })) {
        if (!entry.value.blob) continue

        const blobs = await this.getBlobs(entry.value.source)
        const diff = await blobs?.clear(entry.value.blob, options)
        if (diff) {
          cleared.blocks += diff.blocks
        }
      }
    }

    return options?.diff ? cleared : undefined
  }

  async purge(): Promise<void> {
    if (this._root || this._batch) throw AutodriveError.INVALID_SESSION("Can only purge the main session")

    if (!this.opened) await this.ready()

    const cores = []

    for await (const { key } of this.system!.list()) {
      try {
        const core = this.store.get({ key, compat: false, createIfMissing: false })
        if (core) {
          await core.ready()
          const source = core.core.header.manifest.signers[0].publicKey
          const blobsCore = await this._getCore(source)
          if (blobsCore) {
            cores.push(core, blobsCore)
          } else {
            cores.push(core)
          }
        }
      } catch (err: any) {
        safetyCatch(err)
      }
    }
    for (const { key } of this.system!.views) {
      try {
        const core = this.store.get({ key, compat: false, createIfMissing: false })
        if (core) {
          await core.ready()
          cores.push(core)
        }
      } catch (err: any) {
        safetyCatch(err)
      }
    }
    cores.push(this.system!.core._source.originalCore)

    await this.close()
    await Promise.allSettled(cores.map((c) => c.purge()))
  }
}

function std(name: string, removeSlash: boolean) {
  // Note: only remove slash if you're going to use it as prefix range
  name = unixPathResolve("/", name)
  if (removeSlash && name.endsWith("/")) name = name.slice(0, -1)
  validateFilename(name)
  return name
}

function validateFilename(name: string) {
  if (name === "/") throw AutodriveError.INVALID_FILENAME(name)
}

function prefixRange(name: string, prev = "/") {
  // '0' is binary +1 of /
  return { gt: name + prev, lt: name + "0" }
}

function intRange(start = 0, end = Number.MAX_SAFE_INTEGER): Range<number> {
  return { gt: start, lte: end }
}

function same(a: Head[], b: Head[]) {
  if (a.length !== b.length) return false

  for (let i = 0; i < a.length; i++) {
    const ah = a[i]
    const bh = b[i]

    if (!b4a.equals(ah.key, bh.key)) return false
    if (ah.length !== ah.length) return false
  }

  return true
}

function namespace(source: Uint8Array): Uint8Array {
  return b4a.alloc(0)
}

function shallowReadStream(
  db: Hyperbee<unknown, unknown> | Batch<unknown, unknown>,
  folder: string,
  options: { keys: true },
): Readable<string>
function shallowReadStream(
  db: Hyperbee<unknown, unknown> | Batch<unknown, unknown>,
  folder: string,
  options: { keys: false },
): Readable<Item<string, Entry>>
function shallowReadStream(
  db: Hyperbee<unknown, unknown> | Batch<unknown, unknown>,
  folder: string,
  { keys = false } = {},
): Readable<string | Item<string, Entry>> {
  let prev = "/"
  let prevName = ""

  return new Readable({
    async read(callback) {
      let entry: Item<string, Entry> | null = null

      try {
        entry = await db.peek(prefixRange(folder, prev), { keyEncoding: Files, valueEncoding: Entry })
      } catch (err: any) {
        return callback(err)
      }

      if (!entry) {
        this.push(null)
        return callback(null)
      }

      const suffix = entry.key.slice(folder.length + 1)
      const i = suffix.indexOf("/")
      const name = i === -1 ? suffix : suffix.slice(0, i)

      prev = "/" + name + (i === -1 ? "" : "0")

      // just in case someone does /foo + /foo/bar, but we should prop not even support that
      if (name === prevName) {
        ;(this as any)._read(callback)
        return
      }

      prevName = name
      this.push(keys ? name : entry)
      callback(null)
    },
  })
}

function generateWriterManifest(publicKey: Uint8Array): Manifest {
  return {
    version: 0,
    hash: "blake2b",
    allowPatch: false,
    quorum: 1,
    signers: [
      {
        signature: "ed25519",
        namespace: DEFAULT_NAMESPACE,
        publicKey,
      },
    ],
    prologue: null,
  }
}

function generateContentManifest(m: Manifest | null | undefined, key?: Uint8Array): Manifest | null {
  if (!m) return null

  const signers = []

  if (!key) key = Hypercore.key(m)

  for (const s of m.signers) {
    const namespace = Crypto.hash([BLOBS, key, s.namespace])
    signers.push({ ...s, namespace })
  }

  return {
    version: m.version,
    hash: "blake2b",
    allowPatch: m.allowPatch,
    quorum: m.quorum,
    signers,
    prologue: null,
  }
}

async function getBlobsLength(db: Hyperbee<unknown, unknown>, source: Uint8Array): Promise<number> {
  let length = 0

  for await (const { value } of db.createReadStream({ keyEncoding: Files, valueEncoding: Entry })) {
    if (!b4a.equals(source, value.source)) continue
    const blob = value && value.blob
    if (!blob) continue
    const len = blob.blockOffset + blob.blockLength
    if (len > length) length = len
  }

  return length
}
