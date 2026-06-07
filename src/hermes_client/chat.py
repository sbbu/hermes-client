from __future__ import annotations

import asyncio
import shutil
import sys
from typing import Any

from .dashboard import DashboardClient
from .rpc import Event, JsonRpcWebSocket


class EventPrinter:
    def __init__(self) -> None:
        self._printed_delta = False

    def print_event(self, ev: Event) -> bool:
        """Print event. Return True when a prompt turn is complete."""
        if ev.type == "message.start":
            self._printed_delta = False
        elif ev.type == "message.delta":
            text = str(ev.payload.get("text") or "")
            if text:
                self._printed_delta = True
                print(text, end="", flush=True)
        elif ev.type == "message.complete":
            final = str(ev.payload.get("text") or "")
            if final and not self._printed_delta:
                print(final, end="", flush=True)
            print("", flush=True)
            return True
        elif ev.type == "error":
            print(f"\n[error] {ev.payload.get('message') or ev.payload}", file=sys.stderr)
            return True
        elif ev.type == "status.update":
            text = ev.payload.get("text")
            if text:
                print(f"\n[{ev.payload.get('kind') or 'status'}] {text}", file=sys.stderr)
        elif ev.type == "tool.start":
            name = ev.payload.get("name") or ev.payload.get("tool") or "tool"
            print(f"\n→ {name}", file=sys.stderr)
        elif ev.type == "tool.complete":
            name = ev.payload.get("name") or ev.payload.get("tool") or "tool"
            status = ev.payload.get("status") or "done"
            print(f"✓ {name} {status}", file=sys.stderr)
        return False


async def run_one_prompt(base_url: str, prompt: str, *, cwd: str | None = None) -> None:
    dashboard = DashboardClient(base_url)
    ws_url = dashboard.websocket_url()
    cols = shutil.get_terminal_size((100, 30)).columns
    async with JsonRpcWebSocket(ws_url) as rpc:
        payload = {"cols": cols}
        if cwd:
            payload["cwd"] = cwd
        res: dict[str, Any] = await rpc.request("session.create", payload)
        sid = res["session_id"]
        printer = EventPrinter()
        await rpc.request("prompt.submit", {"session_id": sid, "text": prompt}, timeout=10)
        async for ev in rpc.events():
            if printer.print_event(ev):
                break
        await rpc.request("session.close", {"session_id": sid}, timeout=10)


async def repl(base_url: str) -> None:
    dashboard = DashboardClient(base_url)
    ws_url = dashboard.websocket_url()
    cols = shutil.get_terminal_size((100, 30)).columns
    async with JsonRpcWebSocket(ws_url) as rpc:
        res: dict[str, Any] = await rpc.request("session.create", {"cols": cols})
        sid = res["session_id"]
        info = res.get("info") or {}
        print(f"connected: {info.get('model') or 'Hermes'} @ {base_url}")
        print("ctrl-d or /exit to quit")
        while True:
            try:
                prompt = input("hermes> ")
            except EOFError:
                print()
                break
            if prompt.strip() in {"/exit", "/quit", "q"}:
                break
            if not prompt.strip():
                continue
            printer = EventPrinter()
            await rpc.request("prompt.submit", {"session_id": sid, "text": prompt}, timeout=10)
            async for ev in rpc.events():
                if printer.print_event(ev):
                    break
        await rpc.request("session.close", {"session_id": sid}, timeout=10)


def chat_sync(base_url: str, prompt: str | None = None) -> None:
    if prompt is None:
        asyncio.run(repl(base_url))
    else:
        asyncio.run(run_one_prompt(base_url, prompt))
