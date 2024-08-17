import type Hypercore from "hypercore"
import safetyCatch from "safety-catch"
import BufferMap from "tiny-buffer-map"

const LINGER_TIME = 30_000

interface Wrap {
  session: Hypercore<unknown>
  timeout: NodeJS.Timeout | null
}

export default class CorePool {
  pool: BufferMap<Wrap> = new BufferMap()
  constructor() {}

  linger(writer: Uint8Array, session: Hypercore<unknown>, close?: boolean) {
    if (this.pool.has(writer)) return

    const wrap = {
      session,
      timeout: close === false ? null : setTimeout(ontimeout, LINGER_TIME, this, writer, session),
    }
    session.on("close", () => {
      if (wrap.timeout) {
        clearTimeout(wrap.timeout)
      }
    })

    this.pool.set(writer, wrap)
  }

  get(writer: Uint8Array) {
    const wrap = this.pool.get(writer)
    if (!wrap) return null

    if (wrap.timeout) {
      clearTimeout(wrap.timeout)
      wrap.timeout = setTimeout(ontimeout, LINGER_TIME, this, writer, wrap.session)
    }
    return wrap.session.session()
  }

  clear() {
    const closing = []
    for (const { session, timeout } of this.pool.values()) {
      if (timeout) {
        clearTimeout(timeout)
      }
      closing.push(session.close())
    }
    this.pool.clear()
    return Promise.all(closing)
  }
}

function ontimeout(pool: CorePool, writer: Uint8Array, core: Hypercore<unknown>) {
  core.close().catch(safetyCatch)
  pool.pool.delete(writer)
}
