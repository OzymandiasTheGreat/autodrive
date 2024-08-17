const { eventFlush, replicate, replicateAndSync, sync, synced } = require("autobase-test-helpers")
const b4a = require("b4a")
const Corestore = require("corestore")
const fs = require("fs")
const path = require("path")
const RAM = require("random-access-memory")
const Autodrive = require("../..").default

module.exports = { eventFlush, replicate, replicateAndSync, sync, synced }

module.exports.timeout = async function (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

module.exports.collect = async function (stream) {
  const data = []
  for await (const chunk of stream) {
    data.push(chunk)
  }
  return data.every((chunk) => b4a.isBuffer(chunk)) ? b4a.concat(data) : data
}

module.exports.readdirator = async function* (
  parent,
  { readdir = fs.readdirSync, isDirectory = (x) => fs.statSync(x).isDirectory(), filter = () => true } = {},
) {
  for await (const child of readdir(parent)) {
    const next = path.join(parent, child)
    try {
      if (!filter(child)) continue
      if (await isDirectory(next)) yield* readdirator(next)
      else yield next
    } catch {
      continue
    }
  }
}

module.exports.filter = function (x) {
  return !/node_modules|\.git/.test(x)
}

module.exports.downloader = function (core) {
  const telem = { offsets: [], count: 0 }
  core.on("download", (offset) => {
    telem.count++
    telem.offsets.push(offset)
  })
  return telem
}

module.exports.createTestEnv = async function (
  numWriters = 1,
  numReaders = 1,
  { t = null, sync = true, detached = false } = {},
  options = {},
) {
  const owner = new Autodrive(new Corestore(RAM.reusable()), options)
  await owner.ready()
  const key = detached ? undefined : owner.key

  const writers = [owner]
  owner.on("close", () => writers.splice(writers.indexOf(owner), 1))
  for (let i = 1; i < numWriters; i++) {
    const writer = new Autodrive(new Corestore(RAM.reusable()), key, options)
    await writer.ready()
    key && (await owner.addWriter(writer.local.key))
    writers.push(writer)
  }

  const readers = []
  for (let i = 0; i < numReaders; i++) {
    const reader = new Autodrive(new Corestore(RAM.reusable()), key, options)
    await reader.ready()
    readers.push(reader)
  }

  if (sync && !detached) {
    await replicateAndSync([...writers, ...readers])
  }

  t?.teardown(async () => {
    const promises = []
    for (const drive of [...writers, ...readers]) {
      if (!drive.closed) {
        promises.push(drive.close())
      }
    }
    await Promise.all(promises)
  })

  return {
    writers,
    readers,
    makeWriter,
    makeReader,
  }

  async function makeWriter() {
    const writer = new Autodrive(new Corestore(RAM.reusable()), key, options)
    await writer.ready()
    await owner.addWriter(writer.key)
    writers.push(writer)
    return writer
  }

  async function makeReader() {
    const reader = new Autodrive(new Corestore(RAM.reusable()), key, options)
    await reader.ready()
    readers.push(reader)
    return reader
  }
}

function noop() {}
