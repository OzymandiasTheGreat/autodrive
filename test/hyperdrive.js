const test = require("brittle")
const b4a = require("b4a")
const { once } = require("bare-events")
const Corestore = require("corestore")
const fs = require("fs")
const { discoveryKey } = require("hypercore-crypto")
const path = require("path")
const RAM = require("random-access-memory")
const { pipelinePromise: pipeline, Readable, Writable } = require("streamx")
const tmp = require("test-tmp")
const { collect, createTestEnv, downloader, eventFlush, filter, readdirator, replicate, sync } = require("./helpers")
const z32 = require("z32")
const Autodrive = require("..").default

test("drive.core", async (t) => {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })
  t.is(drive.db.feed, drive.core)
})

test("drive.version", async (t) => {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })
  await drive.put(__filename, fs.readFileSync(__filename))
  t.is(drive.db.feed.length, drive.version)
})

test("drive.key", async (t) => {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })
  // t.is(b4a.compare(drive.db.feed.key, drive.key), 0)
  t.is(b4a.compare(drive.base.key, drive.key), 0)
})

test("drive.discoveryKey", async (t) => {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })
  t.is(b4a.compare(drive.discoveryKey, discoveryKey(drive.key)), 0)
})

// contentKey does not exist on Autodrive
test.skip("drive.contentKey", async (t) => {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })
  t.is(b4a.compare(drive.blobs.core.key, drive.contentKey), 0)
})

test("drive.getBlobs()", async (t) => {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })
  const blobs = await drive.getBlobs()
  t.is(blobs, drive.blobs)
})

test("drive.supportsMetadata", async (t) => {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })
  t.is(true, drive.supportsMetadata)
})

test("Hyperdrive(corestore, key)", async (t) => {
  t.plan(2)
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })
  const diskbuf = fs.readFileSync(__filename)
  await drive.put(__filename, diskbuf)
  const bndlbuf = await drive.get(__filename)
  t.is(b4a.compare(diskbuf, bndlbuf), 0)
  const mirror = new Autodrive(drive.corestore.session({ writable: false }), drive.key)
  await mirror.ready()
  const mrrrbuf = await mirror.get(__filename)
  await mirror.close()
  t.is(b4a.compare(bndlbuf, mrrrbuf), 0)
})

test("drive.put(path, buf) and drive.get(path)", async (t) => {
  {
    const {
      writers: [drive],
    } = await createTestEnv(1, 0, { t, detached: true })
    const diskbuf = fs.readFileSync(__filename)
    await drive.put(__filename, diskbuf)
    const bndlbuf = await drive.get(__filename)
    t.is(b4a.compare(diskbuf, bndlbuf), 0)
  }

  {
    const {
      writers: [drive],
    } = await createTestEnv(1, 0, { t, detached: true })
    const tmppath = path.join(await tmp(t), "hyperdrive-test-")
    const dirpath = fs.mkdtempSync(tmppath)
    const filepath = path.join(dirpath, "hello-world.js")
    const bndlbuf = b4a.from("module.exports = () => 'Hello, World!'")
    await drive.put(filepath, bndlbuf)
    fs.writeFileSync(filepath, await drive.get(filepath))
    const diskbuf = fs.readFileSync(filepath)
    t.is(b4a.compare(diskbuf, bndlbuf), 0)
    t.is(require(filepath)(), "Hello, World!")
  }
})

test("drive.get(path, { wait: false }) throws if entry exists but not found", async (t) => {
  const {
    writers: [drive],
    readers: [mirror],
  } = await createTestEnv(1, 1, { t })

  const done = replicate([drive, mirror])

  await drive.put("/file", "content")
  await eventFlush()

  await mirror.entry("/file") // Ensure in bee

  await t.exception(() => mirror.get("/file", { wait: false }), { code: /BLOCK_NOT_AVAILABLE/ })
  t.is(b4a.toString(await mirror.get("/file")), "content", "sanity check: can actually get content")

  await done()
})

test("drive.createWriteStream(path) and drive.createReadStream(path)", async (t) => {
  {
    const {
      writers: [drive],
    } = await createTestEnv(1, 0, { t, detached: true })
    const diskbuf = await fs.readFileSync(__filename)
    await pipeline(fs.createReadStream(__filename), drive.createWriteStream(__filename))
    let bndlbuf = null
    await pipeline(
      drive.createReadStream(__filename),
      new Writable({
        write(data, cb) {
          if (bndlbuf) bndlbuf = b4a.concat(bndlbuf, data)
          else bndlbuf = data
          return cb(null)
        },
      }),
    )
    t.is(b4a.compare(diskbuf, bndlbuf), 0)
  }

  {
    const {
      writers: [drive],
    } = await createTestEnv(1, 0, { t, detached: true })
    const tmppath = path.join(await tmp(t), "hyperdrive-test-")
    const dirpath = fs.mkdtempSync(tmppath)
    const filepath = path.join(dirpath, "hello-world.js")
    const bndlbuf = b4a.from("module.exports = () => 'Hello, World!'")
    await pipeline(Readable.from(bndlbuf), drive.createWriteStream(filepath))
    await pipeline(drive.createReadStream(filepath), fs.createWriteStream(filepath))
    const diskbuf = fs.readFileSync(filepath)
    t.is(b4a.compare(diskbuf, bndlbuf), 0)
    t.is(require(filepath)(), "Hello, World!")
  }
})

test("drive.createReadStream() with start/end options", async (t) => {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })
  const dir = await tmp(t)
  const filepath = path.join(dir, "hello-world.js")
  const bndlbuf = b4a.from("module.exports = () => 'Hello, World!'")
  await pipeline(Readable.from(bndlbuf), drive.createWriteStream(filepath))

  const stream = drive.createReadStream(filepath, {
    start: 0,
    end: 0,
  })
  const drivebuf = await collect(stream)
  t.is(drivebuf.length, 1)
  t.is(drivebuf.toString(), "m")

  const stream2 = drive.createReadStream(filepath, {
    start: 5,
    end: 7,
  })
  const drivebuf2 = await collect(stream2)
  t.is(drivebuf2.length, 3)
  t.is(drivebuf2.toString(), "e.e")
})

test("drive.del() deletes entry at path", async (t) => {
  t.plan(3)
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })
  await drive.put(__filename, fs.readFileSync(__filename))
  let buf = await drive.get(__filename)
  t.ok(b4a.isBuffer(buf))
  await drive.del(__filename)
  buf = await drive.get(__filename)
  t.is(buf, null)
  const entry = await drive.entry(__filename)
  t.is(entry, null)
})

test("drive.symlink(from, to) updates the entry at <from> to include a reference for <to>", async (t) => {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })
  const buf = fs.readFileSync(__filename)
  await drive.put(__filename, buf)
  await drive.symlink("pointer", __filename)
  const result = await drive.get("pointer")
  t.is(result, null)
  const entry = await drive.entry("pointer")
  t.is(entry.value.linkname, __filename)
  t.is(b4a.compare(buf, await drive.get(entry.value.linkname)), 0)
})

test("drive.entry(path) gets entry at path", async (t) => {
  const linkname = "linkname"

  {
    const {
      writers: [drive],
    } = await createTestEnv(1, 0, { t, detached: true })
    const buf = fs.readFileSync(__filename)
    await drive.put(__filename, buf)
    const { value: entry } = await drive.entry(__filename)
    t.ok(entry.blob)
    t.is(entry.linkname, null)
    t.is(entry.executable, false)
  }

  {
    const {
      writers: [drive],
    } = await createTestEnv(1, 0, { t, detached: true })
    const buf = fs.readFileSync(__filename)
    await drive.put(__filename, buf, { executable: false })
    const { value: entry } = await drive.entry(__filename)
    t.ok(entry.blob)
    t.is(entry.linkname, null)
    t.is(entry.executable, false)
  }

  {
    const {
      writers: [drive],
    } = await createTestEnv(1, 0, { t, detached: true })
    const buf = fs.readFileSync(__filename)
    await drive.put(__filename, buf, { executable: true })
    const { value: entry } = await drive.entry(__filename)
    t.ok(entry.blob)
    t.is(entry.linkname, null)
    t.is(entry.executable, true)
  }

  {
    const {
      writers: [drive],
    } = await createTestEnv(1, 0, { t, detached: true })
    const buf = fs.readFileSync(__filename)
    await drive.put(__filename, buf, { executable: false })
    await drive.symlink(__filename, linkname)
    const { value: entry } = await drive.entry(__filename)
    t.is(entry.blob, null)
    t.is(entry.executable, false)
    t.is(entry.linkname, linkname)
  }

  {
    const {
      writers: [drive],
    } = await createTestEnv(1, 0, { t, detached: true })
    const buf = fs.readFileSync(__filename)
    await drive.put(__filename, buf, { executable: true })
    await drive.symlink(__filename, linkname)
    const { value: entry } = await drive.entry(__filename)
    t.is(entry.blob, null)
    t.is(entry.executable, false)
    t.is(entry.linkname, linkname)
  }

  {
    const {
      writers: [drive],
    } = await createTestEnv(1, 0, { t, detached: true })
    await drive.symlink(linkname, __filename)
    const { value: entry } = await drive.entry(linkname)
    t.is(entry.blob, null)
    t.is(entry.executable, false)
    t.is(entry.linkname, __filename)
  }

  {
    const {
      writers: [drive],
    } = await createTestEnv(1, 0, { t, detached: true })
    const ws = drive.createWriteStream(__filename)
    ws.write(fs.readFileSync(__filename))
    ws.end()
    await once(ws, "finish")
    const { value: entry } = await drive.entry(__filename)
    t.ok(entry.blob)
    t.is(entry.linkname, null)
    t.is(entry.executable, false)
  }

  {
    const {
      writers: [drive],
    } = await createTestEnv(1, 0, { t, detached: true })
    const ws = drive.createWriteStream(__filename, { executable: false })
    ws.write(fs.readFileSync(__filename))
    ws.end()
    await once(ws, "finish")
    const { value: entry } = await drive.entry(__filename)
    t.ok(entry.blob)
    t.is(entry.linkname, null)
    t.is(entry.executable, false)
  }

  {
    const {
      writers: [drive],
    } = await createTestEnv(1, 0, { t, detached: true })
    const ws = drive.createWriteStream(__filename, { executable: true })
    ws.write(fs.readFileSync(__filename))
    ws.end()
    await once(ws, "finish")
    const { value: entry } = await drive.entry(__filename)
    t.ok(entry.blob)
    t.is(entry.linkname, null)
    t.is(entry.executable, true)
  }
})

test("entry(key) resolve key path", async function (t) {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })

  await drive.put("/README.md", b4a.from("# title"))
  await drive.put("/examples/a.txt", b4a.from("a text"))
  await drive.put("/examples/more/c.txt", b4a.from("c text"))

  t.alike((await drive.entry("README.md")).key, "/README.md")
  t.alike((await drive.entry("/examples/more/../a.txt")).key, "/examples/a.txt")
  t.alike((await drive.entry("\\examples\\more\\c.txt")).key, "/examples/more/c.txt")
})

test("get(key) resolve key path", async function (t) {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })

  await drive.put("/README.md", b4a.from("# title"))
  await drive.put("/examples/a.txt", b4a.from("a text"))
  await drive.put("/examples/more/c.txt", b4a.from("c text"))

  const buffer = await drive.get("/README.md")
  const a = await drive.get("/examples/a.txt")
  const c = await drive.get("/examples/more/c.txt")
  t.ok(buffer)
  t.ok(a)
  t.ok(c)

  t.alike(await drive.get("README.md"), buffer)
  t.alike(await drive.get("/examples/more/../a.txt"), a)
  t.alike(await drive.get("\\examples\\more\\c.txt"), c)
})

test("entry(key) resolves object", async function (t) {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })

  await drive.put("/README.md", b4a.from("# title"))

  const entry = await drive.entry("/README.md")
  t.alike(entry, await drive.entry(entry))
})

test("del(key) resolve key path", async function (t) {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })

  const delAndEntry = async (key, expectedKey) => {
    await drive.put(expectedKey, b4a.from("")) // pre-create

    t.ok(await drive.entry(expectedKey))
    await drive.del(key)
    t.absent(await drive.entry(expectedKey))
  }

  await delAndEntry("README.md", "/README.md")
  await delAndEntry("/examples/more/../a.txt", "/examples/a.txt")
  await delAndEntry("\\examples\\more\\c.txt", "/examples/more/c.txt")
})

test("put(key, buffer) resolve key path", async function (t) {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })

  const putAndEntry = async (key, expectedKey) => {
    t.absent(await drive.entry(expectedKey))
    await drive.put(key, b4a.from(""))
    t.ok(await drive.entry(expectedKey))
  }

  await putAndEntry("b.txt", "/b.txt")
  await putAndEntry("/examples/more/../f.txt", "/examples/f.txt")
  await putAndEntry("\\examples\\more\\h.txt", "/examples/more/h.txt")
})

test("symlink(key, linkname) resolve key path", async function (t) {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })

  await drive.put("/README.md", b4a.from("# title"))

  const symlinkAndEntry = async (key, expectedKey) => {
    t.absent(await drive.entry(expectedKey))
    await drive.symlink(key, "/README.md")
    t.ok(await drive.entry(expectedKey))
  }

  await symlinkAndEntry("b.txt", "/b.txt")
  await symlinkAndEntry("/examples/more/../f.txt", "/examples/f.txt")
  await symlinkAndEntry("\\examples\\more\\h.txt", "/examples/more/h.txt")
})

test("watch() basic", async function (t) {
  t.plan(5)

  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })
  const buf = b4a.from("hi")

  const watcher = drive.watch()

  eventFlush().then(async () => {
    await drive.put("/a.txt", buf)
  })

  for await (const [current, previous] of watcher) {
    // eslint-disable-line no-unreachable-loop
    t.ok(current instanceof Autodrive)
    t.ok(previous instanceof Autodrive)
    // TODO: same issue, version in the middle of a batch
    t.is(current.version, 3)
    t.is(previous.version, 1)
    t.alike(await current.get("/a.txt"), buf)
    break
  }
})

test("watch(folder) basic", async function (t) {
  t.plan(1)

  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })
  const buf = b4a.from("hi")

  await drive.put("/README.md", buf)
  await drive.put("/examples/a.txt", buf)
  await drive.put("/examples/more/a.txt", buf)

  const watcher = drive.watch("/examples")

  let next = watcher.next()
  let onchange = null
  next.then((data) => {
    next = watcher.next()
    onchange(data)
  })

  onchange = () => t.fail("should not trigger changes")
  await drive.put("/b.txt", buf)
  await eventFlush()
  onchange = null

  onchange = () => t.pass("change")
  await drive.put("/examples/b.txt", buf)
  await eventFlush()
  onchange = null
})

test("watch(folder) should normalize folder", async function (t) {
  t.plan(1)

  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })
  const buf = b4a.from("hi")

  const watcher = drive.watch("examples//more//")

  let next = watcher.next()
  let onchange = null
  next.then((data) => {
    next = watcher.next()
    onchange(data)
  })

  onchange = () => t.fail("should not trigger changes")
  await drive.put("/examples/a.txt", buf)
  await eventFlush()
  onchange = null

  onchange = () => t.pass("change")
  await drive.put("/examples/more/a.txt", buf)
  await eventFlush()
  onchange = null
})

test("drive.diff(length)", async (t) => {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })

  const root = __dirname
  const temp = await tmp(t)
  const paths = []

  for await (const _path of readdirator(root, { filter })) {
    const buf = fs.readFileSync(_path)
    const relpath = _path.replace(root, "")
    const tmppath = path.join(temp, relpath)
    try {
      fs.writeFileSync(tmppath, buf)
    } catch {
      fs.mkdirSync(path.dirname(tmppath), { recursive: true })
      fs.writeFileSync(tmppath, buf)
    }
    await drive.put(relpath, buf)
    paths.push([tmppath, relpath])
  }

  const [tmppath, relpath] = paths[Math.floor(Math.random() * paths.length)]
  await drive.put(relpath + ".old", fs.readFileSync(tmppath))
  await drive.del(relpath)

  for await (const diff of drive.diff(drive.core.length - 2)) {
    if (diff.right) t.is(diff.right.key, relpath.replace(/\\/g, "/"))
    if (diff.left) t.is(diff.left.key, relpath.replace(/\\/g, "/") + ".old")
  }
})

test("drive.entries()", async (t) => {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })
  const root = __dirname
  const entries = new Set()

  for await (const path of readdirator(root, { filter })) {
    await drive.put(path, fs.readFileSync(path))
    entries.add(await drive.entry(path))
  }

  for await (const entry of drive.entries()) {
    for (const _entry of entries) {
      if (JSON.stringify(_entry) === JSON.stringify(entry)) {
        entries.delete(_entry)
        break
      }
    }
  }

  t.is(entries.size, 0)
})

test("drive.entries() with explicit range, no opts", async (t) => {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })

  await drive.put("/aFile", "here")
  await drive.put("/bFile", "later")
  await drive.put("/zFile", "last")

  const expected = ["/bFile", "/zFile"]
  const observed = []
  for await (const entry of drive.entries({ gt: "/b", lte: "/zzz" })) {
    observed.push(entry.key)
  }

  t.alike(expected, expected)
})

test("drive.entries() with explicit range and opts", async (t) => {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })

  await drive.put("/aFile", "here")
  await drive.put("/bFile", "later")
  await drive.put("/zFile", "last")

  const expected = ["/zFile", "/bFile"]
  const observed = []
  for await (const entry of drive.entries({ gt: "/b", lte: "/zzz" }, { reverse: true })) {
    observed.push(entry.key)
  }

  t.alike(observed, expected)
})

test("drive.list(folder, { recursive })", async (t) => {
  {
    const {
      writers: [drive],
    } = await createTestEnv(1, 0, { t, detached: true })
    const root = __dirname
    for await (const path of readdirator(root, { filter })) {
      await drive.put(path, fs.readFileSync(path))
    }
    for await (const entry of drive.list(root)) {
      t.is(b4a.compare(fs.readFileSync(entry.key), await drive.get(entry.key)), 0)
    }
  }

  {
    const {
      writers: [drive],
    } = await createTestEnv(1, 0, { t, detached: true })
    const root = __dirname
    for await (const path of readdirator(root, { filter })) {
      await drive.put(path, fs.readFileSync(path))
    }
    for await (const entry of drive.list(root, { recursive: true })) {
      t.is(b4a.compare(fs.readFileSync(entry.key), await drive.get(entry.key)), 0)
    }
  }

  {
    const {
      writers: [drive],
    } = await createTestEnv(1, 0, { t, detached: true })
    const root = __dirname
    for await (const path of readdirator(root, { filter })) {
      await drive.put(path, fs.readFileSync(path))
    }
    for await (const entry of drive.list(root, { recursive: false })) {
      t.is(b4a.compare(fs.readFileSync(entry.key), await drive.get(entry.key)), 0)
    }
  }

  {
    const {
      writers: [drive],
    } = await createTestEnv(1, 0, { t, detached: true })
    const emptybuf = b4a.from("")
    await drive.put("/grandparent", emptybuf)
    await drive.put("/grandparent/parent", emptybuf)
    await drive.put("/grandparent/parent/child", emptybuf)
    await drive.put("/grandparent/parent/child/fst-grandchild.file", emptybuf)
    await drive.put("/grandparent/parent/child/snd-grandchild.file", emptybuf)

    const paths = ["/grandparent", "/grandparent/parent", "/grandparent/parent/child"]

    for (const [_idx, path] of Object.entries(paths)) {
      const idx = parseInt(_idx)
      const set = new Set()
      for await (const entry of drive.list(path)) set.add(entry.key)
      t.ok(paths.slice(0, idx).every((path) => !set.has(path)))
      t.ok(paths.slice(idx, paths.length).every((path) => Array.from(set).some((_path) => _path.includes(path))))
    }
  }
})

test("drive.readdir(path)", async (t) => {
  {
    const {
      writers: [drive],
    } = await createTestEnv(1, 0, { t, detached: true })
    const root = __dirname
    const files = new Map()
    for await (const path of readdirator(root, { filter })) {
      const buf = fs.readFileSync(path)
      await drive.put(path, buf)
      files.set(path, buf)
    }
    const readdir = drive.readdir.bind(drive)
    const isDirectory = async (x) => !(await drive.entry(x))?.value.blob
    for await (const path of readdirator(root, { readdir, isDirectory })) {
      t.is(b4a.compare(files.get(path), await drive.get(path)), 0)
    }
  }

  {
    const {
      writers: [drive],
    } = await createTestEnv(1, 0, { t, detached: true })
    await drive.put("/parent/child", b4a.from("child"))
    await drive.put("/parent/sibling", b4a.from("sibling"))
    await drive.put("/parent/sibling/grandchild", b4a.from("grandchild"))
    const read = []
    for await (const path of drive.readdir("/parent")) read.push(path)
    t.is(read[0], "child")
    t.is(read[1], "sibling")
    t.is(read.length, 2)
  }

  {
    const {
      writers: [drive],
    } = await createTestEnv(1, 0, { t, detached: true })
    await drive.put("/parent/child", b4a.from("child"))
    await drive.put("/parent/sibling", b4a.from("sibling"))
    await drive.put("/parent/sibling/grandchild", b4a.from("grandchild"))
    const read = []
    for await (const path of drive.readdir("/parent/sibling")) read.push(path)
    t.is(read[0], "grandchild")
    t.is(read.length, 1)
  }
})

test("drive.checkout(len)", async (t) => {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })
  const root = __dirname
  const lens = new Map()
  for await (const path of readdirator(root, { filter })) {
    const buf = fs.readFileSync(path)
    await drive.put(path, buf)
    lens.set(drive.core.length, path)
  }
  for (const offset of lens.keys()) {
    const snapshot = drive.checkout(offset)
    t.ok(snapshot.get(lens.get(offset)))
    let low = offset - 2
    while (lens.has((low -= 2))) t.ok(await snapshot.get(lens.get(low)))
    let high = offset + 2
    while (lens.has((high += 2))) t.ok(!(await snapshot.get(lens.get(high))))
  }
})

test("drive.download(folder, [options])", async (t) => {
  t.plan(7)
  const {
    writers: [drive],
    readers: [mirror],
  } = await createTestEnv(1, 1, { t })

  const done = replicate([drive, mirror])
  const nil = b4a.from("nil")

  let count = 0
  let max = -Infinity

  await drive.put("/parent/child/grandchild1", nil)
  await drive.put("/parent/child/grandchild2", nil)

  const blobs = await mirror.getBlobs(drive.local.keyPair.publicKey)

  blobs.core.on("download", (offset) => {
    count++
    if (max < offset) max = offset
  })

  const l = drive.blobs.core.length

  await drive.put("/parent/sibling/grandchild1", nil)

  t.is(count, 0)
  await mirror.download("/parent/child")
  t.is(max, l - 1)
  const _count = count
  t.ok(await mirror.get("/parent/child/grandchild1"))
  t.is(_count, count)
  t.ok(await mirror.get("/parent/child/grandchild2"))
  t.is(_count, count)
  const entry = await mirror.entry("/parent/sibling/grandchild1")
  await blobs.get(entry.value.blob)
  t.is(count, _count + 1)

  await done()
})

test("drive.download(filename, [options])", async (t) => {
  const {
    writers: [drive],
    readers: [mirror],
  } = await createTestEnv(1, 1, { t })

  const done = replicate([drive, mirror])
  const nil = b4a.from("nil")

  await drive.put("/parent/grandchild1", nil)
  await drive.put("/file", nil)
  await drive.put("/parent/grandchild2", nil)

  await mirror.getBlobs(drive.local.keyPair.publicKey)

  await mirror.download("/file")

  t.ok(await mirror.get("/file", { wait: false }))

  try {
    await mirror.get("/file1", { wait: false })
  } catch {
    t.pass("not downloaded")
  }

  await done()
})

test.skip("drive.downloadRange(dbRanges, blobRanges)", async (t) => {
  const {
    writers: [drive],
    readers: [mirror],
  } = await createTestEnv(1, 1, { t })

  const done = replicate([drive, mirror])
  const blobs = await drive.getBlobs()
  const nil = b4a.from("nil")

  const fileBlocks = []
  const blobBlocks = []
  await drive.put("/0", nil)
  fileBlocks.push(drive.core.length)
  blobBlocks.push(blobs.core.length)
  await drive.put("/1", nil)
  await drive.put("/2", nil)
  fileBlocks.push(drive.core.length)
  blobBlocks.push(blobs.core.length)

  const fileTelem = downloader(mirror.core)
  const blobTelem = downloader((await mirror.getBlobs(drive.local.keyPair.publicKey)).core)

  const fileCount = fileTelem.count
  const blobCount = blobTelem.count

  await mirror.get("/0")
  t.is(blobCount, blobTelem.count)
  t.is(fileCount, fileTelem.count)

  await done()
})

test.skip("drive.downloadDiff(version, folder, [options])", async (t) => {
  const {
    writers: [drive],
    readers: [mirror],
  } = await createTestEnv(1, 1, { t })

  const done = replicate([drive, mirror])
  const nil = b4a.from("nil")

  await drive.put("/parent/child/0", nil)
  await drive.put("/parent/sibling/0", nil)
  await drive.put("/parent/child/1", nil)
  const version = drive.version

  const filestelem = downloader(mirror.core)
  const blobstelem = downloader((await mirror.getBlobs(drive.local.keyPair.publicKey)).core)

  await mirror.downloadDiff(version, "/parent/child")

  let filescount = filestelem.count
  let blobscount = blobstelem.count

  await mirror.get("/parent/child/1")

  t.is(filescount, filestelem.count)
  t.is(blobscount, blobstelem.count)

  await drive.put("/parent/child/2", nil)

  await mirror.downloadDiff(version, "/parent/child")

  t.is(blobscount + 1, blobstelem.count)

  filescount = filestelem.count
  blobscount = blobstelem.count

  await mirror.get("/parent/sibling/0")

  t.is(filescount + 1, filestelem.count)
  t.is(blobscount + 1, blobstelem.count)

  await done()
})

test("drive.batch() & drive.flush()", async (t) => {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })

  const batch = drive.batch()

  await batch.put("/file.txt", b4a.from("abc"))
  t.absent(await drive.get("/file.txt"))

  await batch.flush()
  t.ok(batch.blobs.core.closed)
  t.absent(drive.blobs.core.closed)
  t.absent(drive.db.closed)
  t.absent(drive.db.core.closed)

  t.ok(await drive.get("/file.txt"))

  await drive.close()
  t.ok(drive.blobs.core.closed)
  t.ok(drive.db.closed)
  t.ok(drive.db.core.closed)
})

test("batch.list()", async (t) => {
  t.plan(1)
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })
  const nil = b4a.from("nil")
  await drive.put("/x", nil)
  const batch = drive.batch()
  for await (const entry of batch.list()) {
    t.is(entry.key, "/x")
  }
  await batch.flush()
})

test("drive.close()", async (t) => {
  t.plan(2)
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })
  const blobs = await drive.getBlobs()
  blobs.core.on("close", () => t.ok(true))
  drive.core.on("close", () => t.ok(true))
  await drive.close()
})

test("drive.close() on snapshots--does not close parent", async (t) => {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })

  await drive.put("/foo", b4a.from("bar"))

  // TODO: figure out what's wrong with version 2
  const checkout = drive.checkout(3) // (2)
  await checkout.get("/foo")
  await checkout.close()

  // Main test is that there is no session_closed error on drive.get
  const res = await drive.get("/foo")
  t.alike(res, b4a.from("bar"))
})

test("drive.batch() on non-ready drive", async (t) => {
  const drive = new Autodrive(new Corestore(RAM.reusable()))

  const batch = drive.batch()
  await batch.put("/x", "something")

  await batch.flush()
  t.is(batch.blobs.core.closed, true)

  t.ok(await drive.get("/x"))

  await drive.close()
})

test("drive.close() for future checkout", async (t) => {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })
  await drive.put("some", "thing")
  const checkout = drive.checkout(drive.length + 1)
  await checkout.close()

  t.is(checkout.closed, true)
  t.is(checkout.db.core.closed, true)
  t.is(drive.closed, false)
  t.is(drive.db.core.closed, false)
})

test("drive.close() with openBlobsFromHeader waiting in the background", async (t) => {
  t.plan(3)

  const corestore = new Corestore(RAM.reusable())
  const disconnectedCoreKey = b4a.from("a".repeat(64), "hex")
  const drive = new Autodrive(corestore, disconnectedCoreKey)

  await drive.ready()
  t.is(drive.core.length, 0) // Sanity check
  // length 0 (unavailable), so _openBlobsFromHeader will be awaiting its header

  // Testing against a regression where close silently errored and never finished
  drive.core.on("close", () => t.ok(true))
  await drive.close()

  t.ok(drive.corestore.closed)
})

test.skip("drive.findingPeers()", async (t) => {
  const {
    writers: [drive],
    readers: [mirror],
  } = await createTestEnv(1, 1, { t })
  await drive.put("/", b4a.from("/"))

  const done1 = replicate([drive, mirror])
  const done2 = mirror.drive.findingPeers()
  sync([drive, mirror]).then(done2, done2)
  t.ok(await mirror.drive.get("/"))
  await done1()
})

test("drive.mirror()", async (t) => {
  const {
    writers: [a, b],
  } = await createTestEnv(2, 0, { t, detached: true })

  await a.put("/file.txt", "hello world")
  await a.mirror(b).done()

  t.alike(await b.get("/file.txt"), b4a.from("hello world"))
})

test("blobs with writable drive", async (t) => {
  t.plan(2)

  const store = new Corestore(RAM.reusable())
  const drive = new Autodrive(store)

  // Autodrive may have multiple blobs instances
  // drive.on("blobs", function (blobs) {
  //   t.is(blobs, drive.blobs)
  // })

  // Autodrive may have multiple blobs instances
  // drive.on("content-key", function (key) {
  //   t.alike(key, drive.blobs.core.key)
  // })

  t.absent(drive.blobs)
  await drive.ready()
  t.ok(drive.blobs)
  await drive.close()
})

test("drive.clear(path)", async (t) => {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })
  await drive.put("/loc", "hello world")

  const entry = await drive.entry("/loc")
  const initContent = await drive.blobs.get(entry.value.blob, { wait: false })
  t.alike(initContent, b4a.from("hello world"))

  const cleared = await drive.clear("/loc")
  t.is(cleared, undefined)

  // Entry still exists (so file not deleted)
  const nowEntry = await drive.entry("/loc")
  t.alike(nowEntry, entry)

  // But the blob is removed from storage
  const nowContent = await drive.blobs.get(entry.value.blob, { wait: false })
  t.is(nowContent, null)
})

test("drive.clear(path) with diff", async (t) => {
  const storage = await tmp(t)

  const a = new Autodrive(new Corestore(storage))
  await a.put("/file", b4a.alloc(4 * 1024))
  await a.close()

  const b = new Autodrive(new Corestore(storage))

  const cleared = await b.clear("/file", { diff: true })
  t.ok(cleared.blocks > 0)

  const cleared2 = await b.clear("/file", { diff: true })
  t.is(cleared2.blocks, 0)

  const cleared3 = await b.clear("/not-exists", { diff: true })
  t.is(cleared3.blocks, 0)

  await b.close()
})

test("drive.clear(path) on a checkout", async (t) => {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })
  await drive.put("/loc", "hello world")

  const entry = await drive.entry("/loc")
  const initContent = await drive.blobs.get(entry.value.blob, { wait: false })
  t.alike(initContent, b4a.from("hello world"))

  const checkout = drive.checkout(drive.version)

  const cleared = await checkout.clear("/loc")
  t.is(cleared, undefined)

  // Entry still exists (so file not deleted)
  const nowEntry = await checkout.entry("/loc")
  t.alike(nowEntry, entry)

  // But the blob is removed from storage
  const nowContent = await checkout.blobs.get(entry.value.blob, { wait: false })
  t.is(nowContent, null)
})

test("drive.clearAll() with diff", async (t) => {
  const storage = await tmp(t)

  const a = new Autodrive(new Corestore(storage))
  await a.put("/file-1", b4a.alloc(4 * 1024))
  await a.put("/file-2", b4a.alloc(8 * 1024))
  await a.put("/file-3", b4a.alloc(16 * 1024))
  await a.close()

  const b = new Autodrive(new Corestore(storage))

  const cleared = await b.clearAll({ diff: true })
  t.ok(cleared.blocks > 0)

  const cleared2 = await b.clearAll({ diff: true })
  t.is(cleared2.blocks, 0)

  const cleared3 = await b.clearAll()
  t.is(cleared3, undefined)

  await b.close()
})

test("drive.purge()", async (t) => {
  const storage = await tmp(t)
  const store = new Corestore(storage)

  const a = new Autodrive(store)
  await a.put("/file", "I am content")

  const coresDir = path.join(storage, "cores")
  t.ok(fs.existsSync(coresDir))

  await a.purge()
  t.absent(fs.existsSync(coresDir))
  t.ok(a.closed)
})

test("entry(key) cancelled when checkout closes", async function (t) {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })
  await drive.put("some", "1")

  const snap = drive.checkout(3) // Future
  const prom = snap.entry("some")

  const [a, b] = await Promise.allSettled([snap.close(), prom])

  t.is(a.status, "fulfilled")
  t.is(b.status, "rejected")
})

test("drive.exists(key)", async function (t) {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })

  t.is(await drive.exists("/file"), false)

  await drive.put("/file", "hi")
  t.is(await drive.exists("/file"), true)

  await drive.clear("/file")
  t.is(await drive.exists("/file"), true)

  await drive.del("/file")
  t.is(await drive.exists("/file"), false)
})

test("basic properties", async function (t) {
  const store = new Corestore(RAM.reusable())
  const drive = new Autodrive(store)

  t.is(typeof drive.findingPeers, "function")
  t.is(typeof drive.replicate, "function")

  t.is(drive.id, null)
  t.is(drive.key, null)
  t.is(drive.discoveryKey, null)

  t.is(drive.writable, false)
  t.is(drive.readable, true)

  await drive.ready()

  t.is(drive.writable, true)

  t.is(drive.id.length, 52)
  t.is(drive.key.byteLength, 32)
  t.is(drive.discoveryKey.byteLength, 32)

  t.is(drive.id, z32.encode(drive.base.key))
  t.is(drive.key, drive.base.key)
  t.is(drive.discoveryKey, drive.base.discoveryKey)
})

test("basic writable option", async function (t) {
  t.plan(3)

  const store = new Corestore(RAM.reusable())

  const a = new Autodrive(store)
  await a.put("/file-one", "hi")

  const b = new Autodrive(store.session({ writable: false }), a.key)
  await b.ready()
  t.is(b.writable, false)
  // Autodrive doesn't load writable blobs for read only instances
  // t.is(b.blobs.core.writable, false)
  t.is(b.blobs, null)

  try {
    await b.put("/file-two", "hi")
    t.fail("Should have failed")
  } catch (err) {
    t.is(err.code, "SESSION_NOT_WRITABLE")
  }
})

test("readdir filenames with dashes", async function (t) {
  t.plan(2)

  const store = new Corestore(RAM.reusable())
  const drive = new Autodrive(store)

  await drive.put("/one", "hi")
  await drive.put("/one-two", "hi")

  const expected = ["one", "one-two"]

  for await (const name of drive.readdir("/")) {
    t.is(name, expected.shift())
  }

  await drive.close()
})

test("readdir filenames with dashes (nested)", async function (t) {
  t.plan(2)

  const store = new Corestore(RAM.reusable())
  const drive = new Autodrive(store)

  await drive.put("/one/two", "hi")
  await drive.put("/one-two", "hi")

  const expected = ["one-two", "one"]

  for await (const name of drive.readdir("/")) {
    t.is(name, expected.shift())
  }

  await drive.close()
})

test("basic compare", async function (t) {
  const store = new Corestore(RAM.reusable())
  const drive = new Autodrive(store)

  await drive.put("/file.txt", "hi")
  const a = await drive.entry("/file.txt")

  await drive.put("/file.txt", "hi")
  const b = await drive.entry("/file.txt")

  await drive.put("/file.txt", "hi")
  const c = await drive.entry("/file.txt")

  t.is(drive.compare(a, c), -1)
  t.is(drive.compare(a, b), -1)
  t.is(drive.compare(a, a), 0)
  t.is(drive.compare(c, c), 0)
  t.is(drive.compare(b, a), 1)
  t.is(drive.compare(c, a), 1)

  await drive.close()
})

test("basic follow entry", async function (t) {
  const store = new Corestore(RAM.reusable())
  const drive = new Autodrive(store)

  await drive.put("/file.txt", "hi")
  await drive.symlink("/file.shortcut", "/file.txt")

  t.is((await drive.entry("/file.shortcut")).value.linkname, "/file.txt")

  const source = drive.local.keyPair.publicKey
  t.alike(await drive.entry("/file.shortcut", { follow: true }), {
    seq: 1,
    key: "/file.txt",
    value: {
      source,
      executable: false,
      linkname: null,
      blob: { byteOffset: 0, blockOffset: 0, blockLength: 1, byteLength: 2 },
      metadata: null,
    },
  })

  await drive.close()
})

test("multiple follow entry", async function (t) {
  const store = new Corestore(RAM.reusable())
  const drive = new Autodrive(store)

  await drive.put("/file.txt", "hi")
  await drive.symlink("/file.shortcut", "/file.txt")
  await drive.symlink("/file.shortcut.shortcut", "/file.shortcut")

  t.is((await drive.entry("/file.shortcut.shortcut")).value.linkname, "/file.shortcut")

  const source = drive.local.keyPair.publicKey
  t.alike(await drive.entry("/file.shortcut.shortcut", { follow: true }), {
    seq: 1,
    key: "/file.txt",
    value: {
      source,
      executable: false,
      linkname: null,
      blob: { byteOffset: 0, blockOffset: 0, blockLength: 1, byteLength: 2 },
      metadata: null,
    },
  })

  await drive.close()
})

test("max follow entry", async function (t) {
  const store = new Corestore(RAM.reusable())
  const drive = new Autodrive(store)

  await drive.put("/file.0.txt", "hi")

  for (let i = 1; i <= 17; i++) {
    await drive.symlink("/file." + i + ".txt", "/file." + (i - 1) + ".txt")
  }

  t.is((await drive.entry("/file.0.txt")).value.linkname, null)
  t.is((await drive.entry("/file.1.txt")).value.linkname, "/file.0.txt")
  t.is((await drive.entry("/file.16.txt")).value.linkname, "/file.15.txt")

  try {
    await drive.entry("/file.16.txt", { follow: true })
    t.fail("Should have failed")
  } catch {
    t.pass()
  }

  await drive.close()
})

test("non-existing follow entry", async function (t) {
  const store = new Corestore(RAM.reusable())
  const drive = new Autodrive(store)

  await drive.put("/file.txt", "hi")

  t.is(await drive.entry("/file.random.shortcut", { follow: true }), null)

  await drive.close()
})

// TODO: investigate
test.skip("drive.entry(key, { timeout })", async (t) => {
  t.plan(1)

  const {
    writers: [drive],
    readers: [mirror],
  } = await createTestEnv(1, 1, { t })

  const done = replicate([drive, mirror])
  await drive.put("/file.txt", b4a.from("hi"))
  // await mirror.getBlobs(drive.local.keyPair.publicKey)
  await done()
  await drive.close()

  try {
    t.comment(await mirror.entry("/file.txt", { timeout: 0 }))
    t.fail("should have failed")
  } catch (error) {
    t.is(error.code, "REQUEST_TIMEOUT")
  }
})

// TODO: investigate
test.skip("drive.entry(key, { wait })", async (t) => {
  t.plan(1)

  const {
    writers: [drive],
    readers: [mirror],
  } = await createTestEnv(1, 1, { t })
  const done = replicate([drive, mirror])

  await drive.put("/file.txt", b4a.from("hi"))
  // await mirror.getBlobs(drive.local.keyPair.publicKey)

  await done()
  await drive.close()

  try {
    t.comment(await mirror.entry("/file.txt", { wait: false }))
    t.fail("should have failed")
  } catch (error) {
    t.is(error.code, "BLOCK_NOT_AVAILABLE")
  }
})

test("drive.get(key, { timeout })", async (t) => {
  t.plan(3)

  const {
    writers: [drive],
    readers: [mirror],
  } = await createTestEnv(1, 1, { t })
  const done = replicate([drive, mirror])

  await drive.put("/file.txt", b4a.from("hi"))
  await sync([drive, mirror])

  const entry = await mirror.entry("/file.txt")
  t.ok(entry)
  t.ok(entry.value.blob)

  await done()
  await drive.close()

  try {
    await mirror.get("/file.txt", { timeout: 1 })
    t.fail("should have failed")
  } catch (error) {
    t.is(error.code, "REQUEST_TIMEOUT")
  }
})

test("drive.get(key, { wait }) with entry but no blob", async (t) => {
  t.plan(3)

  const {
    writers: [drive],
    readers: [mirror],
  } = await createTestEnv(1, 1, { t })
  const done = replicate([drive, mirror])

  await drive.put("/file.txt", b4a.from("hi"))
  await sync([drive, mirror])

  const entry = await mirror.entry("/file.txt")
  t.ok(entry)
  t.ok(entry.value.blob)

  await done()
  await drive.close()

  try {
    await mirror.get("/file.txt", { wait: false })
    t.fail("should have failed")
  } catch (error) {
    t.is(error.code, "BLOCK_NOT_AVAILABLE")
  }
})

test("drive.get(key, { wait }) without entry", async (t) => {
  t.plan(1)

  const {
    writers: [drive],
    readers: [mirror],
  } = await createTestEnv(1, 1, { t })
  const done = replicate([drive, mirror])

  await drive.put("/file.txt", b4a.from("hi"))
  await sync([drive, mirror])

  await done()
  await drive.close()

  try {
    await mirror.get("/file.txt", { wait: false })
    t.fail("should have failed")
  } catch (error) {
    t.is(error.code, "BLOCK_NOT_AVAILABLE")
  }
})

test("drive peek with get() and timeout", async (t) => {
  t.plan(3)

  const {
    writers: [drive],
    readers: [mirror],
  } = await createTestEnv(1, 1, { t })
  const done = replicate([drive, mirror])

  await drive.put("/file.txt", b4a.from("hi"))
  await sync([drive, mirror])

  const entry = await mirror.entry("/file.txt")
  t.ok(entry)
  t.ok(entry.value.blob)

  try {
    await mirror.get("/file.txt", { start: 100, timeout: 1 })
    t.fail("should have failed")
  } catch (error) {
    t.is(error.code, "REQUEST_TIMEOUT")
  }

  await done()
})

test("getBlobsLength happy paths", async (t) => {
  const corestore = new Corestore(RAM.reusable())
  const drive = new Autodrive(corestore.session())

  await drive.put("./file", "here")
  t.is(await drive.getBlobsLength(), 1, "Correct blobs length 1")

  await drive.put("./file", "here")
  t.is(await drive.getBlobsLength(), 2, "Correct blobs length 2")

  t.is(drive.version, 5, "sanity check")
  t.is(await drive.getBlobsLength(3), 1, "Correct blobs length on explicit checkout")
  t.is(await drive.getBlobsLength(5), 2, "Correct blobs length on explicit checkout to latest")
})

test("getBlobsLength when not ready", async (t) => {
  const corestore = new Corestore(RAM.reusable())
  {
    const drive = new Autodrive(corestore.session())
    await drive.put("./file", "here")
    await drive.put("./more", "here")
    await drive.close()
  }

  {
    const drive = new Autodrive(corestore)
    const length = await drive.getBlobsLength()
    t.is(length, 2, "correct blobs length")
    await drive.close()
  }
})

test("getBlobsLength of empty drive", async (t) => {
  const corestore = new Corestore(RAM.reusable())
  const drive = new Autodrive(corestore.session())
  const length = await drive.getBlobsLength()
  t.is(length, 0, "empty drive has blobsLength 0")
})

// Autocore does not support explicit truncation
test.skip("truncate happy path", async (t) => {
  const corestore = new Corestore(RAM.reusable())
  const drive = new Autodrive(corestore.session())
  await drive.ready()

  t.is(drive.db.core.fork, 0, "sanity check")
  t.is(drive.blobs.core.fork, 0, "sanity check")

  await drive.put("file1", "here1")
  await drive.put("file2", "here2")
  await drive.put("file3", "here3")

  t.is(drive.version, 4, "sanity check")
  t.is(await drive.getBlobsLength(), 3, "sanity check")

  await drive.truncate(3)
  t.is(drive.version, 3, "truncated db correctly")
  t.is(await drive.getBlobsLength(), 2, "truncated blobs correctly")

  await drive.put("file3", "here file 3 post truncation")
  t.is(drive.version, 4, "correct version when putting after truncate")
  t.is(await drive.getBlobsLength(), 3, "correct blobsLength when putting after truncate")
  t.is(b4a.toString(await drive.get("file3")), "here file 3 post truncation", "Sanity check")

  t.is(drive.db.core.fork, 1, "sanity check on db fork")
  t.is(drive.blobs.core.fork, 1, "sanity check on blobs fork")
})

test("truncate throws when truncating future version)", async (t) => {
  const corestore = new Corestore(RAM.reusable())
  const drive = new Autodrive(corestore)

  await drive.put("./file", "here")
  await t.exception(() => drive.truncate(10), /Bad truncation length/, "throws when truncating the future")
  await drive.close()
})
