/// <reference types="compact-encoding" />
/// <reference types="streamx" />
declare module "protomux" {
  import { Encoding } from "compact-encoding"
  import { Duplex } from "streamx"

  interface MessageDefinition<T> {
    /** compact-encoding specifying how to encode/decode this message */
    encoding: Encoding<T>
    /** Called when the remote side sends a message.
        Errors here are caught and forwarded to stream.destroy */
    onmessage: (message: T) => Promise<void> | void
  }

  class Message<T> extends MessageDefinition<T> {
    send(data: T): void
  }

  class Channel<H> {
    opened: boolean
    closed: boolean
    destroyed: boolean
    handshake: H | null
    messages: Message<unknown>[]

    fullyOpened(): Promise<void>
    addMessage<T>(message: MessageDefinition<T>): Message<T>
    close(): void
    cork(): void
    uncork(): void
  }

  export default class Protomux<H> {
    isProtomux: boolean

    constructor(stream: Duplex<unknown, unknown>, options?: { alloc?: (size: number) => Uint8Array })

    static isProtomux(mux: Duplex<unknown, unknown>): boolean
    static from(stream: Protomux | Duplex<unknown, unknown>, options?: { alloc?: (size: number) => Uint8Array }): Protomux

    [Symbol.iterator](): IterableIterator<Channel<H>>
    createChannel(options: {
      /** Used to match the protocol */
      protocol: string
      /** Optional additional binary id to identify this channel */
      id?: Uint8Array
      /** If you want multiple sessions with the same protocol and id, set unique: false */
      unique?: boolean
      /** Optional encoding for a handshake */
      handshake?: Encoding<H>
      /** Optional array of messages types you want to send/receive */
      messages?: MessageDefinition<unknown>[]
      /** Called when the remote side adds this protocol.
          Errors here are caught and forwarded to stream.destroy */
      onopen?: (handshake: H) => Promise<void> | void
      /** Called when the channel closes - ie the remote side closes or rejects this protocol or we closed it.
          Errors here are caught and forwarded to stream.destroy */
      onclose?: () => Promise<void> | void
      /** Called after onclose when all pending promises has resolved */
      ondestroy?: () => Promise<void> | void
    }): Channel<H>
    createChannel<H>(options: {
      /** Used to match the protocol */
      protocol: string
      /** Optional additional binary id to identify this channel */
      id?: Uint8Array
      /** If you want multiple sessions with the same protocol and id, set unique: false */
      unique?: boolean
      /** Optional encoding for a handshake */
      handshake?: Encoding<H>
      /** Optional array of messages types you want to send/receive */
      messages?: MessageDefinition<unknown>[]
      /** Called when the remote side adds this protocol.
          Errors here are caught and forwarded to stream.destroy */
      onopen?: (handshake: H) => Promise<void> | void
      /** Called when the channel closes - ie the remote side closes or rejects this protocol or we closed it.
          Errors here are caught and forwarded to stream.destroy */
      onclose?: () => Promise<void> | void
      /** Called after onclose when all pending promises has resolved */
      ondestroy?: () => Promise<void> | void
    }): Channel<H>
    opened(options: { protocol: string; id?: Uint8Array }): boolean
    pair(options: { protocol: string; id?: Uint8Array }, callback: () => Promise<void> | void): void
    unpair(options: { protocol: string; id?: Uint8Array }): void
    open(handshake?: H): void
    cork(): void
    uncork(): void
    isIdle(): boolean
  }
}
