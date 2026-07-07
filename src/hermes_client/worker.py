from __future__ import annotations

import base64
import fnmatch
import json
import os
import posixpath
import re
import shlex
import shutil
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any, Iterable

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


SCREEN_CAPTURE_SENTINELS = {"screen", "desktop", "fullscreen", "full screen", "all"}
DESKTOP_WINDOW_NAMES = ("finder", "desktop", "dock", "progman", "workerw", "program manager", "taskbar")
CUA_SESSION_ID = f"hermes-client-{uuid.uuid4().hex[:12]}"
CUA_STATE: dict[str, Any] = {"pid": None, "window_id": None, "app": None, "title": None}


def _reset_cua_session() -> None:
    global CUA_SESSION_ID
    CUA_SESSION_ID = f"hermes-client-{uuid.uuid4().hex[:12]}"
    CUA_STATE.update({"pid": None, "window_id": None, "app": None, "title": None})

BLOCKED_KEY_COMBOS = {
    frozenset({"cmd", "shift", "backspace"}),
    frozenset({"cmd", "option", "backspace"}),
    frozenset({"cmd", "ctrl", "q"}),
    frozenset({"cmd", "shift", "q"}),
    frozenset({"cmd", "option", "shift", "q"}),
    frozenset({"win", "l"}),
    frozenset({"ctrl", "option", "delete"}),
    frozenset({"ctrl", "option", "del"}),
    frozenset({"option", "f4"}),
}
KEY_ALIASES = {
    "command": "cmd",
    "control": "ctrl",
    "alt": "option",
    "windows": "win",
    "super": "win",
    "meta": "win",
}
BLOCKED_TYPE_PATTERNS = [
    re.compile(r"curl\s+[^|]*\|\s*bash", re.IGNORECASE),
    re.compile(r"curl\s+[^|]*\|\s*sh", re.IGNORECASE),
    re.compile(r"wget\s+[^|]*\|\s*bash", re.IGNORECASE),
    re.compile(r"\bsudo\s+rm\s+-[rf]", re.IGNORECASE),
    re.compile(r"\brm\s+-rf\s+/\s*$", re.IGNORECASE),
    re.compile(r":\s*\(\)\s*\{\s*:\|:\s*&\s*\}", re.IGNORECASE),
]
RM_ROOT_GUARD_REASON = "recursive rm targeting filesystem root"
RM_HOME_GUARD_REASON = "recursive rm targeting user home"
SHELL_IFS_REF_RE = re.compile(r"\$(?:IFS\b|\{IFS(?::?[-=+?][^}]*)?\})")
SHELL_HOME_PARAM_RE = re.compile(r"^\$\{HOME(?::?[-=+?][^}]*)?\}(?:/|$)")
SHELL_USER_HOME_PARAM_RE = re.compile(r"^/(?:Users|home)/\$\{(?:USER|LOGNAME)(?::?[-=+?][^}]*)?\}(?:/|$)")


def _shell_words(fragment: str) -> list[str]:
    # Unquoted $IFS expands to shell word separators before command execution.
    # Normalize it before shlex parsing so payloads like rm${IFS}-rf${IFS}/
    # are judged as the shell would execute them.
    fragment = SHELL_IFS_REF_RE.sub(" ", fragment)
    try:
        return shlex.split(fragment)
    except ValueError:
        return fragment.split()


def _rm_target_is_root(target: str) -> bool:
    raw = target.strip()
    if raw.startswith(("/*", "/./*")) or raw.rstrip("/") in {"", "/."}:
        return True

    normalized = posixpath.normpath(raw)
    if normalized == "/":
        return True

    if not normalized.startswith("/"):
        return False

    first_component = normalized.lstrip("/").split("/", 1)[0]
    # Top-level shell expansions (globs and brace expansion) can expand to
    # filesystem-root children before rm runs, e.g. /[be]* or /{bin,etc}.
    return bool(first_component and any(ch in first_component for ch in "*?[]{}"))


def _target_matches_prefix(target: str, prefix: str) -> bool:
    return target == prefix or target.startswith(f"{prefix}/")


def _rm_target_is_home(target: str) -> bool:
    normalized = target.rstrip("/") or target
    candidates = [normalized]
    if normalized.startswith("/"):
        collapsed = posixpath.normpath(normalized)
        if collapsed not in candidates:
            candidates.append(collapsed)
    symbolic_homes = (
        "~",
        "$HOME",
        "${HOME}",
        "/Users/$USER",
        "/Users/${USER}",
        "/Users/$LOGNAME",
        "/Users/${LOGNAME}",
        "/home/$USER",
        "/home/${USER}",
        "/home/$LOGNAME",
        "/home/${LOGNAME}",
    )
    if any(_target_matches_prefix(candidate, prefix) for candidate in candidates for prefix in symbolic_homes):
        return True
    if any(SHELL_HOME_PARAM_RE.match(candidate) for candidate in candidates):
        return True
    if any(SHELL_USER_HOME_PARAM_RE.match(candidate) for candidate in candidates):
        return True
    # Shell substitutions like /Users/$(whoami) and /home/`id -un` resolve
    # to the active user's home at execution time. Treat any dynamic username
    # segment under the standard home roots as a home-targeting rm payload.
    dynamic_home_prefixes = ("/Users/$(", "/Users/`", "/home/$(", "/home/`")
    if any(candidate.startswith(dynamic_home_prefixes) for candidate in candidates):
        return True
    home = str(Path.home()).rstrip("/")
    return bool(home and home != "/" and any(_target_matches_prefix(candidate, home) for candidate in candidates))


def _rm_word_is_command(word: str) -> bool:
    basename = word.rstrip("/").rsplit("/", 1)[-1].lower()
    return basename in {"rm", "rm.exe"}


def _dangerous_rm_args_reason(args: list[str]) -> str | None:
    flags: set[str] = set()
    targets: list[str] = []
    parse_flags = True
    for word in args:
        flag_word = word.lower()
        if parse_flags and word == "--":
            parse_flags = False
            continue
        if parse_flags and flag_word.startswith("--"):
            if flag_word in {"--recursive", "--force"}:
                flags.add(flag_word)
            continue
        if parse_flags and word.startswith("-") and len(word) > 1:
            flags.update(flag_word[1:])
            continue
        targets.append(word)

    recursive = "r" in flags or "--recursive" in flags
    force = "f" in flags or "--force" in flags
    if recursive and force and any(_rm_target_is_root(target) for target in targets):
        return RM_ROOT_GUARD_REASON
    if recursive and force and any(_rm_target_is_home(target) for target in targets):
        return RM_HOME_GUARD_REASON
    return None


def _dangerous_rm_target_reason(text: str) -> str | None:
    fragments = [text or "", *re.split(r"[\r\n;|&`()]+", text or "")]
    seen: set[str] = set()
    for fragment in fragments:
        if fragment in seen:
            continue
        seen.add(fragment)
        words = _shell_words(fragment)
        for index, word in enumerate(words):
            if not _rm_word_is_command(word):
                continue
            reason = _dangerous_rm_args_reason(words[index + 1 :])
            if reason:
                return reason
    return None


def _canon_key_combo(keys: str) -> frozenset[str]:
    parts = [p.strip().lower() for p in re.split(r"\s*\+\s*", keys or "") if p.strip()]
    return frozenset(KEY_ALIASES.get(p, p) for p in parts)


def blocked_type_pattern(text: str) -> str | None:
    rm_reason = _dangerous_rm_target_reason(text)
    if rm_reason:
        return rm_reason
    for pat in BLOCKED_TYPE_PATTERNS:
        if pat.search(text or ""):
            return pat.pattern
    return None


def blocked_key_combo(keys: str) -> list[str] | None:
    combo = _canon_key_combo(keys)
    for blocked in BLOCKED_KEY_COMBOS:
        if blocked.issubset(combo) and len(blocked) <= len(combo):
            return sorted(blocked)
    return None


def resolve_cua_driver() -> str | None:
    for raw in (
        os.environ.get("HERMES_CUA_DRIVER_CMD"),
        shutil.which("cua-driver"),
        str(Path.home() / ".local" / "bin" / "cua-driver"),
        "/opt/homebrew/bin/cua-driver",
        "/usr/local/bin/cua-driver",
        "/Applications/CuaDriver.app/Contents/MacOS/cua-driver",
    ):
        if not raw:
            continue
        candidate = Path(raw).expanduser()
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    return None


def _run_cua(tool: str, args: dict[str, Any] | None = None, timeout: int = 30) -> dict[str, Any]:
    driver = resolve_cua_driver()
    if not driver:
        raise RuntimeError("cua-driver not found; run `hermes-client install-computer-use` on this Mac")
    payload = dict(args or {})
    for attempt in range(2):
        proc = subprocess.run(
            [driver, "call", tool, json.dumps(payload)],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=max(1, min(int(timeout), 120)),
        )
        out = (proc.stdout or "").strip()
        err = (proc.stderr or "").strip()
        combined = f"{out}\n{err}".lower()
        if "session ended" in combined and attempt == 0:
            _reset_cua_session()
            if "session" in payload:
                payload["session"] = CUA_SESSION_ID
            continue
        if proc.returncode != 0:
            raise RuntimeError((err or out or f"cua-driver {tool} failed").strip())
        try:
            parsed = json.loads(out) if out else {}
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"cua-driver {tool} returned non-JSON output: {out[:500]}") from exc
        return parsed if isinstance(parsed, dict) else {"data": parsed}
    raise RuntimeError(f"cua-driver {tool} failed after resetting session")


def _window_name(window: dict[str, Any]) -> str:
    return f"{window.get('app_name') or ''} {window.get('title') or ''}".strip()


def _select_window(app: str | None = None) -> dict[str, Any]:
    data = _run_cua("list_windows", {"on_screen_only": True, "session": CUA_SESSION_ID})
    windows = data.get("windows") or []
    if not isinstance(windows, list) or not windows:
        raise RuntimeError("no on-screen windows found on local Mac")
    needle = (app or "").strip().lower()
    if needle:
        names = DESKTOP_WINDOW_NAMES if needle in SCREEN_CAPTURE_SENTINELS else (needle,)
        for window in windows:
            hay = _window_name(window).lower()
            if any(name in hay for name in names):
                return window
        raise RuntimeError(f"no local Mac window matched app={app!r}")
    return windows[0]


_ELEMENT_LINE_RE = re.compile(r'^\s*(?:-\s+)?\[(\d+)\]\s+(\w+)(?:\s+"([^"]*)"|\s+\(([^)]*)\)|\s*=\s*"([^"]*)")?', re.MULTILINE)


def _element_lines(tree: str, max_elements: int) -> list[str]:
    lines = []
    for match in _ELEMENT_LINE_RE.finditer(tree or ""):
        idx, role = match.group(1), match.group(2)
        label = next((g for g in match.groups()[2:] if g), "")
        label_part = f" {label!r}" if label else ""
        lines.append(f"#{idx} {role}{label_part}")
        if len(lines) >= max_elements:
            break
    return lines


def _capture_local(app: str | None = None, mode: str = "som", max_elements: int = 100) -> tuple[str, bytes | None, dict[str, Any]]:
    window = _select_window(app)
    pid = int(window["pid"])
    window_id = int(window["window_id"])
    state = _run_cua("get_window_state", {"pid": pid, "window_id": window_id, "session": CUA_SESSION_ID}, timeout=45)
    CUA_STATE.update({"pid": pid, "window_id": window_id, "app": window.get("app_name"), "title": window.get("title")})
    tree = str(state.get("tree_markdown") or "")
    total = int(state.get("element_count") or 0)
    cap = max(1, min(int(max_elements or 100), 1000))
    element_index = _element_lines(tree, cap)
    width = int(state.get("screenshot_width") or 0)
    height = int(state.get("screenshot_height") or 0)
    title = window.get("title") or ""
    summary_lines = [
        f"local Mac capture mode={mode} {width}x{height} app={window.get('app_name') or ''} window={title!r}",
        f"pid={pid} window_id={window_id}",
        f"{total} interactable element(s):",
        *element_index,
    ]
    if total > len(element_index):
        summary_lines.append(f"  (response truncated to {len(element_index)} of {total}; pass max_elements or app= to narrow)")
    summary = "\n".join(summary_lines)
    image_bytes = None
    if mode != "ax" and state.get("screenshot_png_b64"):
        try:
            image_bytes = base64.b64decode(str(state["screenshot_png_b64"]))
        except Exception:
            image_bytes = None
    meta = {
        "mode": mode,
        "width": width,
        "height": height,
        "app": window.get("app_name"),
        "window_title": title,
        "pid": pid,
        "window_id": window_id,
        "total_elements": total,
        "elements": element_index,
    }
    return summary, image_bytes, meta


def _target_pid_window() -> tuple[int, int]:
    pid = CUA_STATE.get("pid")
    window_id = CUA_STATE.get("window_id")
    if pid is None or window_id is None:
        window = _select_window(None)
        pid, window_id = int(window["pid"]), int(window["window_id"])
        CUA_STATE.update({"pid": pid, "window_id": window_id, "app": window.get("app_name"), "title": window.get("title")})
    return int(pid), int(window_id)


def _maybe_capture_after(result: dict[str, Any], capture_after: bool, app: str | None, max_elements: int) -> dict[str, Any]:
    if not capture_after:
        return result
    summary, _image, meta = _capture_local(app=app, max_elements=max_elements)
    return {"action_result": result, "capture": {"summary": summary, **meta}}


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
        cmd = resolve_cua_driver()
        if not cmd:
            return {"installed": False, "message": "cua-driver not found"}
        proc = subprocess.run([cmd, "call", "check_permissions", "{}"], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
        return {"installed": True, "command": cmd, "exit_code": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr}

    @mcp.tool()
    def local_computer_use(
        action: str,
        mode: str = "som",
        app: str | None = None,
        element: int | None = None,
        coordinate: list[int] | None = None,
        button: str = "left",
        modifiers: list[str] | None = None,
        from_element: int | None = None,
        to_element: int | None = None,
        from_coordinate: list[int] | None = None,
        to_coordinate: list[int] | None = None,
        direction: str = "down",
        amount: int = 3,
        text: str = "",
        keys: str = "",
        value: str = "",
        seconds: float = 1.0,
        capture_after: bool = False,
        max_elements: int = 100,
        raise_window: bool = False,
    ):
        """Drive this Mac's desktop in the background via cua-driver.

        Preferred workflow: action='capture' mode='som', then click by element.
        This controls the local client machine while the Hermes brain runs remotely.
        """
        from mcp.server.fastmcp import Image

        act = (action or "").strip().lower()
        if act == "capture":
            summary, image, meta = _capture_local(app=app, mode=mode, max_elements=max_elements)
            if image and mode != "ax":
                return [summary, Image(data=image, format="png")]
            return {"summary": summary, **meta}
        if act == "wait":
            time.sleep(max(0.0, min(float(seconds), 30.0)))
            return {"ok": True, "action": "wait", "seconds": seconds}
        if act == "list_apps":
            return _run_cua("list_apps", {"session": CUA_SESSION_ID})
        if act == "focus_app":
            window = _select_window(app)
            CUA_STATE.update({"pid": int(window["pid"]), "window_id": int(window["window_id"]), "app": window.get("app_name"), "title": window.get("title")})
            return {"ok": True, "action": "focus_app", "app": window.get("app_name"), "window_title": window.get("title"), "raise_window_ignored": bool(raise_window)}

        pid, window_id = _target_pid_window()
        base = {"pid": pid, "session": CUA_SESSION_ID}
        if act in {"click", "double_click", "right_click", "middle_click"}:
            if act == "middle_click":
                return {"error": "middle_click is not supported by cua-driver on this platform"}
            args = dict(base)
            if element is not None:
                args.update({"element_index": int(element), "window_id": window_id})
            elif coordinate:
                args.update({"x": float(coordinate[0]), "y": float(coordinate[1]), "window_id": window_id})
            else:
                return {"error": f"{act} requires element or coordinate"}
            if modifiers:
                args["modifier"] = modifiers
            tool = {"click": "click", "double_click": "double_click", "right_click": "right_click"}[act]
            result = _run_cua(tool, args)
            return _maybe_capture_after(result, capture_after, app, max_elements)
        if act == "drag":
            if not from_coordinate or not to_coordinate:
                return {"error": "drag currently requires from_coordinate and to_coordinate"}
            args = dict(base, window_id=window_id, from_x=float(from_coordinate[0]), from_y=float(from_coordinate[1]), to_x=float(to_coordinate[0]), to_y=float(to_coordinate[1]), button=button or "left")
            if modifiers:
                args["modifier"] = modifiers
            result = _run_cua("drag", args)
            return _maybe_capture_after(result, capture_after, app, max_elements)
        if act == "scroll":
            args = dict(base, window_id=window_id, direction=direction, amount=max(1, min(int(amount), 50)))
            if element is not None:
                args["element_index"] = int(element)
            result = _run_cua("scroll", args)
            return _maybe_capture_after(result, capture_after, app, max_elements)
        if act == "type":
            pat = blocked_type_pattern(text)
            if pat:
                return {"error": f"blocked pattern in type text: {pat!r}"}
            args = dict(base, text=text, window_id=window_id)
            if element is not None:
                args["element_index"] = int(element)
            result = _run_cua("type_text", args)
            return _maybe_capture_after(result, capture_after, app, max_elements)
        if act == "key":
            blocked = blocked_key_combo(keys)
            if blocked:
                return {"error": f"blocked key combo: {blocked}"}
            parts = [p.strip() for p in re.split(r"\s*\+\s*", keys or "") if p.strip()]
            if len(parts) >= 2:
                result = _run_cua("hotkey", dict(base, window_id=window_id, keys=parts))
            elif parts:
                result = _run_cua("press_key", dict(base, window_id=window_id, key=parts[0]))
            else:
                return {"error": "key requires keys"}
            return _maybe_capture_after(result, capture_after, app, max_elements)
        if act == "set_value":
            if element is None:
                return {"error": "set_value requires element"}
            result = _run_cua("set_value", dict(base, window_id=window_id, element_index=int(element), value=str(value)))
            return _maybe_capture_after(result, capture_after, app, max_elements)
        return {"error": f"unknown action {action!r}"}

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
