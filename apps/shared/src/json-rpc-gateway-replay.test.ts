import { beforeEach, describe, expect, it, vi } from "vitest";

import { JsonRpcGatewayClient } from "./json-rpc-gateway";

class FakeWebSocket extends EventTarget {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  sent: string[] = [];

  constructor(readonly url: string) {
    super();
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }

  open(): void {
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
  }

  serverFrame(value: unknown): void {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(value) }),
    );
  }

  lastRequest(): {
    id: string;
    method: string;
    params: Record<string, unknown>;
  } {
    return JSON.parse(this.sent.at(-1) ?? "{}");
  }
}

let sockets: FakeWebSocket[];

function makeClient(): JsonRpcGatewayClient {
  return new JsonRpcGatewayClient({
    connectTimeoutMs: 1000,
    socketFactory: (url) => new FakeWebSocket(url) as unknown as WebSocket,
  });
}

async function reconnect(client: JsonRpcGatewayClient): Promise<FakeWebSocket> {
  client.close();
  const connecting = client.connect("ws://example");
  const socket = sockets.at(-1)!;
  socket.open();
  await connecting;
  return socket;
}

describe("JsonRpcGatewayClient replay", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    sockets = FakeWebSocket.instances;
  });

  it("tracks monotonic per-session sequence watermarks", async () => {
    const client = makeClient();
    const connecting = client.connect("ws://example");
    sockets[0].open();
    await connecting;

    sockets[0].serverFrame({
      method: "event",
      params: { type: "message.delta", session_id: "a", seq: 4 },
    });
    sockets[0].serverFrame({
      method: "event",
      params: { type: "message.delta", session_id: "a", seq: 2 },
    });
    sockets[0].serverFrame({
      method: "event",
      params: { type: "tool.start", session_id: "b", seq: 9 },
    });

    expect(client.getSeqWatermarks()).toEqual({ a: 4, b: 9 });
    client.close();
  });

  it("requests and dispatches missed events after reconnect", async () => {
    const client = makeClient();
    const seen: number[] = [];
    client.on("tool.complete", (event) =>
      seen.push((event.payload as { n: number }).n),
    );

    const connecting = client.connect("ws://example");
    sockets[0].open();
    await connecting;
    sockets[0].serverFrame({
      method: "event",
      params: { type: "message.delta", session_id: "a", seq: 3 },
    });

    const socket = await reconnect(client);
    await vi.waitFor(() =>
      expect(socket.lastRequest()).toMatchObject({
        method: "session.events.since",
        params: { session_id: "a", last_seen: 3 },
      }),
    );

    const request = socket.lastRequest();
    socket.serverFrame({
      id: request.id,
      result: {
        events: [
          { type: "tool.complete", session_id: "a", seq: 4, payload: { n: 1 } },
          { type: "tool.complete", session_id: "a", seq: 5, payload: { n: 2 } },
        ],
      },
    });

    await vi.waitFor(() => expect(seen).toEqual([1, 2]));
    expect(client.getSeqWatermarks()).toEqual({ a: 5 });
    client.close();
  });

  it("does not request replay without a watermark", async () => {
    const client = makeClient();
    const connecting = client.connect("ws://example");
    sockets[0].open();
    await connecting;

    const socket = await reconnect(client);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(socket.sent).toEqual([]);
    client.close();
  });

  it("does not dispatch stale replay frames twice", async () => {
    const client = makeClient();
    const seen: number[] = [];
    client.on("status.update", (event) => seen.push(event.seq!));
    const connecting = client.connect("ws://example");
    sockets[0].open();
    await connecting;
    sockets[0].serverFrame({
      method: "event",
      params: { type: "status.update", session_id: "a", seq: 10 },
    });

    const socket = await reconnect(client);
    await vi.waitFor(() =>
      expect(socket.lastRequest().method).toBe("session.events.since"),
    );
    const request = socket.lastRequest();
    socket.serverFrame({
      id: request.id,
      result: {
        events: [{ type: "status.update", session_id: "a", seq: 2 }],
      },
    });

    await Promise.resolve();
    expect(seen).toEqual([10]);
    client.close();
  });
});
