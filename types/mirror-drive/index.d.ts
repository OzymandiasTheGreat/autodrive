/// <reference types="autodrive" />
/// <reference types="compact-encoding" />
/// <reference types="hyperbee" />
declare module "mirror-drive" {
  import { Autodrive } from "../.."
  import { JsonValue } from "compact-encoding"
  import { Item } from "hyperbee"

  type Drive = Autodrive | Hyperdrive | Localdrive

  interface Options {
    prefix?: string
    dryRun?: boolean
    prune?: boolean
    includeEquals?: boolean
    filter?: (path: string) => boolean
    metadataEquals?: (src: JsonValue, dest: JsonValue) => boolean
    batch?: boolean
    entries?: Item<string, unknown>[]
  }

  export default class MirrorDrive {
    count: { files: number; add: number; remove: number; change: number }

    constructor(src: Drive, dest: Drive, options?: Options)
    done(): Promise<void>
  }
}
