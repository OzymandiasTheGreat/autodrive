import c from "compact-encoding"
import { namespace } from "hypercore-crypto"
import SubEncoder from "sub-encoder"

const NAME = "AUTODRIVE"
export const FILESYSTEM = `${NAME}_FILESYSTEM`
export const WAKEUP_PROTOCOL = `${NAME}_WAKEUP`
const [BLOBS, FILES, HISTORY, CONFLICT] = namespace(NAME, 4)

export { BLOBS }

const Subs = new SubEncoder()
export const Files: SubEncoder<string> = Subs.sub(FILES, "utf-8")
const History: SubEncoder<string> = Subs.sub(HISTORY, "utf-8")
const Conflict: SubEncoder<string> = Subs.sub(CONFLICT, "utf-8")

export function history(path: string): SubEncoder<number> {
  return History.sub(path, c.lexint)
}

export function conflicts(path: string): SubEncoder<number> {
  return Conflict.sub(path, c.lexint)
}
