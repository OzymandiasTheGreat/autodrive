/// <reference types="compact-encoding" />
/// <reference types="node" />
/// <reference types="protomux" />
/// <reference types="streamx" />
declare module "protomux-rpc" {
  import { Encoding } from "compact-encoding"
  import { EventEmitter } from "events"
  import Protomux from "protomux"
  import { Duplex } from "streamx"

  type MethodMap<T> = Record<keyof T, any[]> | DefaultMethodMap
  type DefaultMethodMap = [never]
  type Request<M, T, D> = T extends DefaultMethodMap ? D : M extends keyof T ? T[M][0] : D
  type Response<M, T, D> = T extends DefaultMethodMap ? D : M extends keyof T ? T[M][1] : D
  type Method<M, T> = T extends DefaultMethodMap ? string | symbol : M | keyof T
  type Handler<M, T, D> = T extends DefaultMethodMap
    ? (...args: unknown[]) => Promise<unknown> | unknown
    : M extends keyof T
    ? (req: Request<M, T, D>) => Promise<Response<M, T, D>> | Response<M, T, D>
    : (req: D) => Promise<D> | D

  export default class ProtomuxRPC<T extends MethodMap<T> = DefaultMethodMap, H = Uint8Array, D = Uint8Array> extends EventEmitter<{
    open: [H]
    close: []
    destroy: []
  }> {
    opened: boolean
    closed: boolean
    mux: Protomux<H>
    stream: Duplex<unknown, unknown>

    constructor(
      stream: Duplex<unknown, unknown> | Protomux<H>,
      options?: {
        /** Optional binary ID to identify this RPC channel */
        id?: Uint8Array
        /** Optional protocol name */
        protocol?: string
        /** Optional default value encoding */
        valueEncoding?: Encoding<D>
        /** Optional handshake */
        handshake?: H
        /** Optional encoding for the handshake */
        handshakeEncoding?: Encoding<H>
      },
    )

    respond<M>(
      method: Method<M, T>,
      options:
        | {
            /** Optional encoding for both requests and responses, defaults to raw */
            valueEncoding?: Encoding<Request<M, T, D> & Response<M, T, D>>
            /** Optional encoding for requests */
            requestEncoding?: Encoding<Request<M, T, D>>
            /** Optional encoding for responses */
            responseEncoding?: Encoding<Response<M, T, D>>
          }
        | Handler<M, T, D>,
      handler?: Handler<M, T, D>,
    ): void
    unrespond<M>(method: Method<M, T>): void
    request<M>(
      method: Method<M, T>,
      value: Request<M, T, D>,
      options?: {
        /** Optional encoding for both requests and responses, defaults to raw */
        valueEncoding?: Encoding<Request<M, T, D> & Response<M, T, D>>
        /** Optional encoding for requests */
        requestEncoding?: Encoding<Request<M, T, D>>
        /** Optional encoding for responses */
        responseEncoding?: Encoding<Response<M, T, D>>
        timeout?: number
      },
    ): Promise<Response<M, T, D>>
    event<M>(
      method: Method<M, T>,
      value: Request<M, T, D>,
      options?: {
        /** Optional encoding for both requests and responses, defaults to raw */
        valueEncoding?: Encoding<Request<M, T, D> & Response<M, T, D>>
        /** Optional encoding for requests */
        requestEncoding?: Encoding<Request<M, T, D>>
        /** Optional encoding for responses */
        responseEncoding?: Encoding<Response<M, T, D>>
      },
    ): void
    cork(): void
    uncork(): void
    fullyOpened(): Promise<void>
    end(): Promise<void>
  }
}
