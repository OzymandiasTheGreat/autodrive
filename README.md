# autodrive

Autodrive is a secure, real-time, multi-writer, distributed file system

## Install

`npm i autodrive`

## Usage

```typescript
import Autodrive from "autodrive"
import b4a from "b4a"
import Corestore from "corestore"
import { once } from "bare-events"
import fs from "fs"

const driveA = new Autodrive(new Corestore("./storageA"))
await driveA.ready()
const driveB = new Autodrive(new Corestore("./storageB"), driveA.key)
await driveB.ready()

await driveA.put("/example.txt", b4a.from("Hello, World!"))
const data = await driveB.get("/example.txt")

const ws = driveB.createWriteStream("/example.txt")
const rs = fs.createReadStream("./file.txt")
rs.pipe(ws)
await once(ws, "finish")

for await (const chunk of driveA.createReadStream("/example.txt")) {
  console.log(b4a.toString(chunk))
}

await driveA.del("/example.txt")
```

## API

#### `const drive = new Autodrive(store, key, options)`

Create new Autodrive. `store` must be an instance of Corestore.
If you provide a key you get read access to the drive at key.
Options include:

```typescript
interface Options {
  /** The key pair to use for the local writer */
  keyPair?: KeyPair
  /** see Autobase */
  ackInterval?: number
  /** Encrypt block storage with this key */
  encryptionKey?: Uint8Array | null
  /** see Autobase *//
  fastForward?: boolean
  /** Restrict writes to existing files to writers who's
   * publicKey (source) resolves to the same namespace */
  namespace?: (source: Uint8Array) => Uint8Array
}
```

#### `await drive.ready()`

Wait until internal state is loaded. Use it once before accessing synchronous properties like `key`.

#### `await drive.close()`

Fully close this drive and all internal hypercores used by it.

#### `drive.id`

The ID of the drive, this consists of base-z-32 encoded key of the drive.

#### `drive.key`

The binary hash of the drive's signers. Giving this someone grants full read access to the drive.

#### `drive.discoveryKey`

Hash of the `drive.key`. Use this to e.g. replicate drive over Hyperswarm without leaking read access.

#### `drive.contentKey`

The key of the local Hyperblobs instance.

#### `drive.keyPair`

For writable drives this is the key pair used to authenticate local writer. `null` otherwise.

#### `drive.encrypted`

Boolean indicating whether this drive uses encryption.

#### `drive.encryptionKey`

Buffer containing the key used to encrypt this drive. `null` otherwise.

#### `drive.base`

The underlying Autobase instance. This is what enable multi writer access.

#### `drive.local`

Local writer hypercore. If the drive is not writable this is null.

#### `drive.db`

The underlying file database, an instance of Hyperbee.

#### `drive.blobs`

The local Hyperblobs instance. `null` on non-writable drives.

#### `drive.store`

The Corestore used to instantiate this drive.

#### `drive.corestore`

The Corestore used to instantiate this drive. Hyperdrive compat.

#### `drive.version`

The current version of the drive's file database.

#### `drive.writable`

Boolean indicating whether this drive has write access.

#### `drive.readable`

Should always be true.

#### `drive.supportsMetadata`

Whether this drive supports file metadata. Should always be true.

#### `drive.namespace`

The namespace of the local writer. If no `namespace()` is provided in the constructor, all writers have an empty buffer as the namespace.

#### `const blobs = await drive.getBlobs(source?: Uint8Array)`

Get the Hyperblobs instance for the given writer. If source is omitted, returns Hyperblobs for the local writer.

#### `await drive.addWriter(key: Uint8Array, indexer?: boolean)`

Add writer to this drive. `key` can be obtained by accessing `drive.local.key` on the writer to be added. Can only be called by existing writer.

#### `await drive.removeWriter(key: Uint8Array)`

Remove a writer from this drive. `key` should be `drive.local.key` of the writer to be removed. Can only be called by existing writer.

#### `await drive.update()`

Try to download the latest version of the files database. Calling this may emit conflicts that occurred while drive was offline.

#### `const stream = drive.replicate(isInitiator: boolean)`

See [`Corestore.replicate()`](https://github.com/holepunchto/corestore#const-stream--storereplicateoptsorstream)

#### `const done = drive.findingPeers()`

Indicating that you're finding peers in the background, operations will be on hold until `done()` is called.
Call `done()` when current iteration finishes, e.g. after `swarm.flush()`.

#### `const checkout = drive.checkout(version: number)`

Checkout an earlier database version. This allows to go back in time to an earlier filesystem state.

#### `const batch = drive.batch()`

Atomically make changes to the file system. Always call `await batch.flush()` after you're done.

#### `const mirror = drive.mirror(dest: Drive, options?: MirrorDrive Options)`

Mirror this drive into an instance of either another Autodrive, Hyperdrive, or Localdrive. Returns an instance of MirrorDrive.

#### `const item = await drive.entry(pathOrSeq: string | number, options?: { follow?: boolean, wait?: boolean, timeout?: number })`

Get an entry in the files database, either by path or by seq (database version).

- If `follow` is true and the entry is a symlink, this will resolve the destination.
- `wait: false` returns immediately, if the entry is not locally available, it will return `null`.
- `timeout` specifies how long to wait for the entry data to download. The default timeout of 0 means wait indefinitely.

#### `const buffer = await drive.get(pathSeqOrEntry: string | number | Entry, options?: { follow?: boolean, wait?: boolean, timeout?: number })`

Get the file contents. Takes either a path, a seq, or Entry object returned by other methods.
Options are the same as `drive.entry()`.

#### `await drive.put(path: string, data: string | Uint8Array, options?: { executable: boolean, metadata?: JSON })`

Write data to the filesystem, either creating or updating a file. For large data consider `drive.createWriteStream()`.

#### `await drive.del(path: string, options?: { clear?: boolean, history?: boolean, diff?: boolean })`

Delete a file from filesystem. Options are:
`clear`: whether to also clear file data from local cache
`history`: if this and clear are both true, delete file data for all file versions in the local cache.
`diff`: if clear and this is true, returns how many bytes were cleared.

#### `await resolve(path: string, data?: string | Uint8Array, options?: { executable?: boolean, metadata?: JSON })`

Resolve an existing conflict at path. If `data` is provided, it's used as the final version of the file. If no `data` is provided, file is deleted. For large data consider `drive.createWriteStream()` with the resolve option.
Options are the same as `drive.put()`.

#### `for await (const chunk of drive.createReadStream(path: string, options?: { start?: number, end?: number, length?: number, follow?: boolean, wait?: boolean, timeout?: number }))`

Get a readable stream of file data at path. Options are same as `drive.entry()` with the addition of range options:

- `start`: byte offset at which to start reading
- `end`: byte offset at which to stop
- `length`: how many bytes to read

#### `const ws = drive.createWriteStream(path: string, options?: { executable?: boolean, metadata?: JSON, resolve?: boolean })`

Efficiently write data at given path, returns a writable stream. Options are the same as `drive.put()` with the addition of `resolve`: if true and there's a file conflict at given path, treat written data as the final resolved version of the file.

#### `await symlink(path: string, dest: string, options?: { executable?: boolean, metadata?: JSON })`

Create a symlink to another location in the filesystem. Options are the same as `drive.createWriteStream()`.

#### `await drive.exists(path: string, options?: { wait?: boolean, timeout?: number })`

Check if the file at given path exists. Options are the same as `drive.entry()` without the `follow`.

#### `for await (const item of drive.list(folder?: string, options?: { recursive?: boolean }))`

List file entries at a given folder. If `recursive: true` also descends into the subdirectories.

#### `for await (const filename of drive.readdir(folder?: string))`

List filenames of entries at given folder.

#### `for await (const entry of drive.conflicts(path: string, options?: { limit?: number, reverse?: boolean }))`

If there is a conflict at given path, list conflicting entries.
Options are:
`limit`: How many entries to return at most
`reverse`: Start at the last conflicting entry

#### `for await (const item of drive.history(path: string, options?: { limit?: number, reverse?: boolean }))`

List previous versions of file at path. Starts at the current version and goes backwards. If the file was deleted at given version, yields `null`. Options are the same as `drive.conflicts()`.

#### `const int = drive.compare(a: Item, b: Item)`

Returns `0` if entries are the same, `1` if `a` is older, and `-1` if `b` is older.

#### `for await (const { left: Item, right: Item } of drive.diff(version: number, folder?: string, options?: { limit?: number }))`

Efficiently create a stream of the shallow changes to folder between `version` and `drive.version`.
Each entry is sorted by key.
If an entry exists in `drive.version` of the folder but not in `version`, then `left` is set and `right` will be `null`, and vice versa.

#### `const watcher = drive.watch(folder?: string)`

Returns an iterator that listens on `folder` to yield changes, by default on `/`.

Usage example:

```typescript
for await (const [current, previous] of watcher) {
  console.log(current.version)
  console.log(previous.version)
}
```

Those current and previous are Autodrive snapshots that are auto-closed before next value.
Don't close those snapshots yourself because they're used internally, let them be auto-closed.

##### `await watcher.ready()`

Waits until the watcher is loaded and detecting changes.

##### `await watcher.destroy()`

Stops the watcher. You could also stop it by using break in the loop.

##### `await drive.download(folder?: string, options?: { recursive?: boolean })`

Downloads the blobs corresponding to all entries in the drive at paths prefixed with `folder`.

#### `await drive.downloadDiff(version: number, folder?: string, options?: { limit?: number })`

Downloads all the blobs in `folder` corresponding to entries in `drive.checkout(version)` that are not in `drive.version`.
In other words, downloads all the blobs added to `folder` up to `version` of the drive.

#### `await drive.downloadRange(blobRanges: Range & { source: Uint8Array })`

Downloads all the blobs in [range](https://github.com/holepunchto/hypercore#const-range--coredownloadrange). Range needs to also include the source of the blobs to download from.

#### `const { blocks: number } = await drive.clear(pathSeqOrEntry: string | number | Entry, options?: { diff?: boolean, history?: boolean })`

Deletes the blob from storage to free up space, but the file structure reference is kept. Options are:

- `diff`: unless true, returned object is null
- `history`: when given a path, also clear the blobs for earlier versions

#### `const { blocks: number } = await drive.clearAll(options?: { diff?: boolean, history?: boolean })`

Clear all blobs from storage, freeing up space. Options are the same as `drive.clear()`

#### `await drive.purge()`

Delete all data used by this drive from the local filesystem, effectively erasing the drive.

## Types

### Blob

The ID object identifying data store in blobs hypercores,
paired with a source this allows to retrieve the actual binary data.

```typescript
interface Blob {
  blockOffset: number
  blockLength: number
  byteOffset: number
  /** The size of this file in bytes */
  byteLength: number
}
```

### Entry

The main file object Autodrive deals with.

```typescript
interface Entry {
  /** The writer core publicKey that produced this version of a file */
  source: Uint8Array
  /** Blob object pointing to the actual file data */
  blob?: Blob | null
  executable: boolean
  /** If this is a symlink, linkname will point to the destination */
  linkname?: string | null
  /** Any additional data you want to associate with the file, stored as JSON */
  metadata?: JsonValue
}
```

### Item

Carry over from hyperbee, Item wraps entry with additional metadata.

```typescript
interface Item {
  /** The database version when this entry was written */
  seq: number
  /** The path at which this entry is stored */
  key: string
  /** The Entry object */
  value: Entry
}
```

### ErrorCode

The enum containing possible codes of errors thrown by Autodrive.
You can check which error you got by inspecting `error.code` property.

```typescript
enum ErrorCode {
  BLOCK_NOT_AVAILABLE,
  REQUEST_TIMEOUT,
  INVALID_OPERATION,
  INVALID_FILENAME,
  INVALID_SESSION,
  FILE_NOT_FOUND,
  FILE_CONFLICT,
  PERMISSION_DENIED,
  RECURSIVE_SYMLINK,
  SESSION_NOT_WRITABLE,
  STREAM_CLOSED,
  BAD_ARGUMENT,
}
```
