from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from importlib import resources
from pathlib import Path
from typing import Any

from .config import APP_DIR, ensure_app_dir
from .dashboard import DashboardClient


def packaged_tui_entry() -> Any:
    return resources.files("hermes_client.tui_dist").joinpath("entry.js")


def resolve_node() -> str:
    configured = os.environ.get("HERMES_CLIENT_NODE") or os.environ.get("HERMES_NODE")
    if configured and Path(configured).is_file():
        return configured

    bundled = Path.home() / ".local" / "share" / "hermes-client" / "nodeenv" / "bin" / "node"
    if bundled.is_file():
        return str(bundled)

    node = shutil.which("node")
    if node:
        return node

    raise RuntimeError(
        "node is not installed. Re-run the installer, or install Node.js, then try `hermes-client tui` again."
    )


def run_tui(
    base_url: str,
    *,
    query: str | None = None,
    resume: str | None = None,
    inline: bool | None = None,
    mouse: bool | None = None,
) -> int:
    node = resolve_node()
    dashboard = DashboardClient(base_url)
    ws_url = dashboard.websocket_url()

    ensure_app_dir()
    local_home = APP_DIR / "hermes-home"
    local_home.mkdir(parents=True, exist_ok=True)
    active_session = tempfile.NamedTemporaryFile(prefix="hermes-client-tui-session-", suffix=".json", delete=False)
    active_session.close()

    env = os.environ.copy()
    env["HERMES_TUI_GATEWAY_URL"] = ws_url
    env["HERMES_TUI_ACTIVE_SESSION_FILE"] = active_session.name
    # Force thin-client runtime boundaries even when launched from a shell that
    # already has a full local Hermes environment exported.
    env["HERMES_HOME"] = str(local_home)
    env["HERMES_CWD"] = os.getcwd()
    env.setdefault("NODE_ENV", "production")
    env["HERMES_BIN"] = shutil.which("hermes-client") or sys.argv[0] or "hermes-client"
    if query:
        env["HERMES_TUI_QUERY"] = query
    if resume:
        env["HERMES_TUI_RESUME"] = resume
    if inline is not None:
        env["HERMES_TUI_INLINE"] = "1" if inline else "0"
    if mouse is not None:
        env["HERMES_TUI_MOUSE_TRACKING"] = "1" if mouse else "0"

    with resources.as_file(packaged_tui_entry()) as entry:
        entry_path = Path(entry)
        if not entry_path.is_file():
            raise RuntimeError(f"packaged TUI entry missing: {entry_path}")
        return subprocess.call([node, "--expose-gc", str(entry_path)], env=env)
