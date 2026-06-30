import { JsonRpcGatewayClient } from '@hermes/shared'
import { describe, expect, it } from 'vitest'

const tick = () => new Promise(resolve => setTimeout(resolve, 0))
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

class FakeWebSocket {
  readyState = 0

  private readonly listeners = new Map<string, Set<EventListener>>()

  addEventListener(type: string, listener: EventListener): void {
    let handlers = this.listeners.get(type)

    if (!handlers) {
      handlers = new Set()
      this.listeners.set(type, handlers)
    }

    handlers.add(listener)
  }

  close(): void {
    this.readyState = 3
    this.dispatch('close')
  }

  open(): void {
    this.readyState = 1
    this.dispatch('open')
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener)
  }

  send(): void {
    // no-op
  }

  private dispatch(type: string): void {
    const event = new Event(type)

    for (const listener of this.listeners.get(type) ?? []) {
      listener.call(this as unknown as WebSocket, event)
    }
  }
}

describe('JsonRpcGatewayClient connection lifecycle', () => {
  it('keeps concurrent connect callers pending until the shared socket opens', async () => {
    const socket = new FakeWebSocket()

    const client = new JsonRpcGatewayClient({
      connectTimeoutMs: 0,
      socketFactory: () => socket as unknown as WebSocket
    })

    const first = client.connect('ws://host/api/ws?token=t')
    let secondSettled = false

    const second = client.connect('ws://host/api/ws?token=t').then(() => {
      secondSettled = true
    })

    await tick()
    expect(secondSettled).toBe(false)

    socket.open()
    await expect(first).resolves.toBeUndefined()
    await expect(second).resolves.toBeUndefined()
    expect(secondSettled).toBe(true)
  })

  it('rejects an in-flight connect immediately when closed', async () => {
    const socket = new FakeWebSocket()

    const client = new JsonRpcGatewayClient({
      connectTimeoutMs: 0,
      socketFactory: () => socket as unknown as WebSocket
    })

    const pending = client.connect('ws://host/api/ws?token=t')
    client.close()

    const result = await Promise.race([
      pending.then(
        () => 'resolved',
        error => (error instanceof Error ? error.message : String(error))
      ),
      delay(20).then(() => 'pending')
    ])

    expect(result).toBe('WebSocket closed')
    expect(client.connectionState).toBe('closed')
  })
})
