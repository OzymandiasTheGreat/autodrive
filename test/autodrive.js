const test = require("brittle")
const b4a = require("b4a")
const fs = require("fs")
const path = require("path")
const { pipelinePromise: pipeline } = require("streamx")
const z32 = require("z32")
const { collect, createTestEnv, eventFlush, filter, readdirator, replicate, replicateAndSync, sync } = require("./helpers")

test("drive.id", async (t) => {
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t, detached: true })
  t.is(drive.id, z32.encode(drive.key))
})

test("drive.put(path, buf) and drive.get(path) (multiwriter)", async (t) => {
  t.plan(6)
  const {
    writers: [drive, other],
    readers: [mirror],
  } = await createTestEnv(2, 1, { t, sync: false })
  const done = replicate([drive, other, mirror])

  await drive.put(__filename, fs.readFileSync(__filename))
  await eventFlush()

  const dbuf = await drive.get(__filename)
  const obuf = await other.get(__filename)
  const mbuf = await mirror.get(__filename)
  t.alike(dbuf, fs.readFileSync(__filename))
  t.alike(obuf, dbuf)
  t.alike(mbuf, dbuf)

  const path = "/test"
  const payload = b4a.from("Hello, World!")

  await other.put(path, payload)
  await eventFlush()

  const dbuf2 = await drive.get(path)
  const obuf2 = await other.get(path)
  const mbuf2 = await mirror.get(path)
  t.alike(dbuf2, payload)
  t.alike(obuf2, payload)
  t.alike(mbuf2, payload)

  await done()
})

test("Wakeup", async (t) => {
  t.plan(4)
  const path = "/w"
  const {
    writers: [writer],
    readers: [readerA, readerB],
  } = await createTestEnv(1, 2, { t })

  let done = replicate([writer, readerA])
  await writer.put(path, "Hello, World!")
  await sync([writer, readerA])
  t.alike(await readerA.get(path), b4a.from("Hello, World!"))

  await done()
  await writer.close()

  done = replicate([readerA, readerB])
  await sync([readerA, readerB])
  await t.execution(readerA._pool.clear())
  await t.exception(readerB.get(path, { wakeup: false }), { code: /BLOCK_NOT_AVAILABLE/ })
  t.alike(await readerB.get(path), b4a.from("Hello, World!"))
  await done()
})

test("Conflicts", async (t) => {
  const {
    writers: [drive, other],
  } = await createTestEnv(2, 0, { t })
  const files = await collect(readdirator(path.join(__dirname, ".."), { filter }))

  drive.on("conflict", (path) => {
    t.ok(files.includes(path))
  })

  const conflicts = []
  for (let i = 0; i < files.length; i++) {
    if (i % 3 === 0) {
      conflicts.push(files[i])
      await drive.put(files[i], fs.readFileSync(files[i]))
    }
    await other.put(files[i], fs.readFileSync(files[i]))
  }

  t.plan(conflicts.length * 5)

  await replicateAndSync([drive, other])

  for (let i = 0; i < conflicts.length; i++) {
    if (i % 2 === 0) {
      await t.exception(drive.entry(conflicts[i]), { code: /FILE_CONFLICT/ })
    } else {
      await t.exception(drive.get(conflicts[i]), { code: /FILE_CONFLICT/ })
    }
  }

  for (let i = 0; i < conflicts.length; i++) {
    if (i % 2 === 0) {
      await t.exception(drive.put(conflicts[i], fs.readFileSync(conflicts[i])), { code: /FILE_CONFLICT/ })
    } else {
      await t.exception(drive.del(conflicts[i]))
    }
  }

  for (let i = 0; i < conflicts.length; i++) {
    if (i % 2 === 0) {
      await t.execution(drive.resolve(conflicts[i]))
    } else if (i % 3 === 0) {
      await t.execution(drive.resolve(conflicts[i], fs.readFileSync(conflicts[i])))
    } else {
      await t.execution(pipeline(fs.createReadStream(conflicts[i]), drive.createWriteStream(conflicts[i], { resolve: true })))
    }
  }

  for (let i = 0; i < conflicts.length; i++) {
    if (i % 2 === 0) {
      await t.execution(drive.entry(conflicts[i]))
    } else if (i % 3 === 0) {
      await t.execution(drive.get(conflicts[i]))
    } else {
      await t.execution(drive.del(conflicts[i]))
    }
  }
})

test("history and get(seq)", async (t) => {
  t.plan(4)
  const {
    writers: [drive],
  } = await createTestEnv(1, 0, { t })

  const path = "/file.txt"
  const payloads = [b4a.from("Hello, World!"), b4a.from("Hej, Verden!"), b4a.from("Sveikas, pasauli!")]

  for (const payload of payloads) {
    await drive.put(path, payload)
  }

  const entries = await collect(drive.history(path))

  t.is(entries.length, payloads.length)

  payloads.reverse()
  for (let i = 0; i < entries.length; i++) {
    t.alike(await drive.get(entries[i].seq), payloads[i])
  }
})

test("namespacing", async (t) => {
  t.plan(3)
  const namespace = (key) => key
  const {
    writers: [drive, other],
  } = await createTestEnv(2, 0, { t }, { namespace })
  replicate([drive, other])

  const path = "/file.txt"
  const payloads = [b4a.from("Hello, World!"), b4a.from("Hej, Verden!"), b4a.from("Sveikas, pasauli!")]

  await t.execution(drive.put(path, payloads[0]))
  await t.exception(other.put(path, payloads[1]), { code: /PERMISSION_DENIED/ })
  await t.execution(drive.put(path, payloads[2]))
})
