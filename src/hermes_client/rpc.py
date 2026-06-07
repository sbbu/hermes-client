from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import websockets


class RpcError(RuntimeError):
    pass


@dataclass
class Event:
    type: str
    payload: dict[str, Any]


class JsonRpcWebSocket:
    def __init__(self, ws_url: str):
        self.ws_url = ws_url
        self._ws = None
        self._seq = 0
        self._pending: dict[str, asyncio.Future] = {}
        self._events: asyncio.Queue[Event] = asyncio.Queue()
        self._reader_task: asyncio.Task | None = None

    async def __aenter__(self) -> "JsonRpcWebSocket":
        self._ws = await websockets.connect(self.ws_url, max_size=None)
        self._reader_task = asyncio.create_task(self._reader())
        for _ in range(20):
            ev = await asyncio.wait_for(self._events.get(), timeout=10)
            if ev.type == "gateway.ready":
                return self
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        if self._reader_task:
            self._reader_task.cancel()
        if self._ws:
            await self._ws.close()

    async def _reader(self) -> None:
        assert self._ws is not None
        async for raw in self._ws:
            frame = json.loads(raw)
            fid = frame.get("id")
            if fid and fid in self._pending:
                fut = self._pending.pop(fid)
                if frame.get("error"):
                    err = frame["error"]
                    fut.set_exception(RpcError(str(err.get("message") or err)))
                else:
                    fut.set_result(frame.get("result"))
                continue
            if frame.get("method") == "event":
                params = frame.get("params") or {}
                if isinstance(params, dict):
                    await self._events.put(Event(str(params.get("type") or ""), params.get("payload") or {}))

    async def request(self, method: str, params: dict[str, Any] | None = None, timeout: float = 120.0) -> Any:
        assert self._ws is not None
        self._seq += 1
        rid = f"c{self._seq}"
        fut = asyncio.get_running_loop().create_future()
        self._pending[rid] = fut
        await self._ws.send(json.dumps({"jsonrpc": "2.0", "id": rid, "method": method, "params": params or {}}))
        return await asyncio.wait_for(fut, timeout=timeout)

    async def events(self) -> AsyncIterator[Event]:
        while True:
            yield await self._events.get()
