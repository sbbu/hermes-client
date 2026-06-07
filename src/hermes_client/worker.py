from __future__ import annotations

import fnmatch
import os
import re
import subprocess
from pathlib import Path
from typing import Iterable

DEFAULT_BLOCKED_SHELL = re.compile(
    r"\b(sudo|su|rm|rmdir|mv|chmod|chown|dd|mkfs|diskutil|launchctl|shutdown|reboot|osascript)\b|[;&|`]\s*(curl|wget)\b.*\|\s*(sh|bash)",
    re.I,
)


def expand_roots(roots: Iterable[str] | None) -> list[Path]:
    raw = list(roots or []) or ["~/code", "~/projects", "~/Documents"]
    out: list[Path] = []
    for item in raw:
        p = Path(item).expanduser().resolve()
        if p.exists():
            out.append(p)
    if not out:
        out.append(Path.home().resolve())
    return out


def assert_under_roots(path: str | Path, roots: list[Path]) -> Path:
    p = Path(path).expanduser().resolve()
    for root in roots:
        if p == root or root in p.parents:
            return p
    allowed = ", ".join(str(r) for r in roots)
    raise ValueError(f"path outside allowed roots: {p} (allowed: {allowed})")


def command_allowed(command: str, allow_mutating: bool = False) -> bool:
    if allow_mutating:
        return True
    return DEFAULT_BLOCKED_SHELL.search(command or "") is None


def make_mcp(roots: list[Path], allow_mutating_shell: bool = False, host: str = "127.0.0.1", port: int = 8766):
    from mcp.server.fastmcp import FastMCP
    from mcp.server.fastmcp.server import TransportSecuritySettings

    allowed_hosts = ["127.0.0.1:*", "localhost:*", "[::1]:*", f"{host}:*"]
    allowed_origins = ["http://127.0.0.1:*", "http://localhost:*", "http://[::1]:*", f"http://{host}:*"]
    mcp = FastMCP(
        "hermes-client-local-worker",
        host=host,
        port=port,
        streamable_http_path="/mcp",
        transport_security=TransportSecuritySettings(
            allowed_hosts=allowed_hosts,
            allowed_origins=allowed_origins,
        ),
    )

    @mcp.tool()
    def local_info() -> dict:
        """Return worker identity and allowed roots."""
        return {"cwd": os.getcwd(), "allowed_roots": [str(r) for r in roots], "mutating_shell": allow_mutating_shell}

    @mcp.tool()
    def local_read_file(path: str, max_bytes: int = 120000) -> str:
        """Read a UTF-8-ish text file under the worker's allowed roots."""
        p = assert_under_roots(path, roots)
        data = p.read_bytes()[: max(1, int(max_bytes))]
        return data.decode("utf-8", errors="replace")

    @mcp.tool()
    def local_write_file(path: str, content: str) -> dict:
        """Overwrite a file under the worker's allowed roots."""
        p = assert_under_roots(path, roots)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content)
        return {"ok": True, "path": str(p), "bytes": len(content.encode())}

    @mcp.tool()
    def local_search_files(pattern: str, root: str | None = None, max_results: int = 100) -> list[str]:
        """Find files by glob under an allowed root."""
        base = assert_under_roots(root or roots[0], roots)
        limit = max(1, min(int(max_results), 500))
        hits: list[str] = []
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [d for d in dirnames if d not in {".git", "node_modules", ".venv", "venv", "__pycache__"}]
            for name in filenames:
                rel = str(Path(dirpath, name).relative_to(base))
                if fnmatch.fnmatch(rel, pattern) or fnmatch.fnmatch(name, pattern):
                    hits.append(str(Path(dirpath, name)))
                    if len(hits) >= limit:
                        return hits
        return hits

    @mcp.tool()
    def local_run(command: str, cwd: str | None = None, timeout: int = 120) -> dict:
        """Run a shell command on the local machine under an allowed cwd. Mutating-looking commands are blocked by default."""
        if not command_allowed(command, allow_mutating_shell):
            raise ValueError("blocked mutating/destructive-looking shell command; restart worker with --allow-mutating-shell if you really want this")
        wd = assert_under_roots(cwd or roots[0], roots)
        proc = subprocess.run(
            command,
            shell=True,
            cwd=str(wd),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=max(1, min(int(timeout), 600)),
        )
        return {"exit_code": proc.returncode, "stdout": proc.stdout[-20000:], "stderr": proc.stderr[-20000:], "cwd": str(wd)}

    @mcp.tool()
    def local_computer_use_status() -> dict:
        """Check whether cua-driver is installed locally for future GUI-control bridging."""
        from shutil import which
        cmd = which("cua-driver")
        if not cmd:
            return {"installed": False, "message": "cua-driver not found"}
        proc = subprocess.run([cmd, "check_permissions"], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
        return {"installed": True, "command": cmd, "exit_code": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr}

    return mcp


def mcp_config_text(host: str, port: int) -> str:
    return (
        "mcp_servers:\n"
        "  local_worker:\n"
        f"    url: \"http://{host}:{port}/mcp\"\n"
        "    enabled: true\n"
        "    timeout: 120\n"
        "    connect_timeout: 30\n"
        "    tools:\n"
        "      resources: false\n"
        "      prompts: false"
    )


def run_worker(host: str, port: int, roots: list[str], allow_mutating_shell: bool = False) -> None:
    expanded = expand_roots(roots)
    mcp = make_mcp(expanded, allow_mutating_shell=allow_mutating_shell, host=host, port=port)
    print(f"hermes-client worker listening: http://{host}:{port}/mcp")
    print("allowed roots:")
    for r in expanded:
        print(f"  - {r}")
    print("mini config:")
    print(mcp_config_text(host, port))
    mcp.run(transport="streamable-http")
