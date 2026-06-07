from __future__ import annotations

import argparse
import getpass
import os
import plistlib
import subprocess
import sys
import webbrowser
from pathlib import Path

from .chat import chat_sync
from .config import load_config, save_config
from .dashboard import DashboardClient, normalize_base_url
from .tui import run_tui
from .worker import mcp_config_text, run_worker

INSTALL_SPEC = "hermes-client[worker] @ git+https://github.com/sbbu/hermes-client.git"


def _configured_url(args) -> str:
    raw = getattr(args, "url", None) or load_config().base_url
    if not raw:
        raise SystemExit("no remote URL configured; run `hermes-client configure --url http://HOST:9119`")
    return normalize_base_url(raw)


def _launchctl(*args: str, check: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(["launchctl", *args], check=check, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def _load_plist(label: str, plist: Path) -> None:
    if sys.platform != "darwin":
        return
    uid = os.getuid()
    _launchctl("bootout", f"gui/{uid}", str(plist))
    _launchctl("bootstrap", f"gui/{uid}", str(plist))
    _launchctl("kickstart", "-k", f"gui/{uid}/{label}")


def _unload_plist(plist: Path) -> None:
    if sys.platform != "darwin":
        return
    uid = os.getuid()
    _launchctl("bootout", f"gui/{uid}", str(plist))


def _write_launchd_plist(plist: Path, data: dict) -> None:
    plist.parent.mkdir(parents=True, exist_ok=True)
    with plist.open("wb") as f:
        plistlib.dump(data, f, sort_keys=False)
    try:
        plist.chmod(0o644)
    except OSError:
        pass


def _state_dir() -> Path:
    path = Path.home() / ".local" / "state" / "hermes-client"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _default_worker_roots() -> list[str]:
    candidates = [Path.home() / name for name in ("code", "src", "Developer", "Documents")]
    roots = [str(p) for p in candidates if p.exists()]
    return roots or [str(Path.home() / "Documents")]


def _resolve_worker_host(host: str, wait_seconds: int = 0) -> str:
    if host != "auto":
        return host

    import time

    wait_forever = wait_seconds < 0
    deadline = time.time() + max(0, wait_seconds)
    while True:
        try:
            proc = subprocess.run(
                ["tailscale", "ip", "-4"],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=5,
            )
            ips = [line.strip() for line in proc.stdout.splitlines() if line.strip()]
            if ips:
                return ips[0]
        except Exception:
            pass
        if not wait_forever and time.time() >= deadline:
            return "127.0.0.1"
        time.sleep(5)


def cmd_configure(args) -> None:
    cfg = load_config()
    cfg.base_url = normalize_base_url(args.url)
    save_config(cfg)
    print(f"configured remote: {cfg.base_url}")


def cmd_status(args) -> None:
    url = _configured_url(args)
    d = DashboardClient(url)
    status = d.status()
    print(f"remote: {url}")
    print(f"version: {status.get('version')} ({status.get('release_date')})")
    print(f"gateway: {status.get('gateway_state')} pid={status.get('gateway_pid')}")
    print(f"auth_required: {status.get('auth_required')} providers={status.get('auth_providers')}")
    platforms = status.get("gateway_platforms") or {}
    if platforms:
        print("platforms: " + ", ".join(f"{k}:{v.get('state')}" for k, v in platforms.items()))


def cmd_login(args) -> None:
    url = _configured_url(args)
    username = args.username or input("username: ")
    password = getpass.getpass("password: ")
    d = DashboardClient(url)
    d.login_password(args.provider, username, password)
    print("login ok; cookies saved")


def cmd_open(args) -> None:
    url = _configured_url(args)
    target = url.rstrip("/") + ("/chat" if args.chat else "")
    webbrowser.open(target)
    print(target)


def cmd_chat(args) -> None:
    url = _configured_url(args)
    chat_sync(url, args.prompt)


def cmd_tui(args) -> None:
    url = _configured_url(args)
    raise SystemExit(
        run_tui(
            url,
            query=getattr(args, "query", None),
            resume=getattr(args, "resume", None),
            inline=getattr(args, "inline", None),
            mouse=getattr(args, "mouse", None),
        )
    )


def cmd_worker(args) -> None:
    roots = args.allow_root or load_config().worker_roots or _default_worker_roots()
    host = _resolve_worker_host(args.host, wait_seconds=0)
    run_worker(host, args.port, roots, allow_mutating_shell=args.allow_mutating_shell)


def cmd_worker_service_run(args) -> None:
    roots = args.allow_root or load_config().worker_roots or _default_worker_roots()
    host = _resolve_worker_host(args.host, wait_seconds=args.wait_seconds)
    run_worker(host, args.port, roots, allow_mutating_shell=args.allow_mutating_shell)


def cmd_mcp_config(args) -> None:
    host = _resolve_worker_host(args.host, wait_seconds=0)
    print(mcp_config_text(host, args.port))


def cmd_install_desktop_shortcut(args) -> None:
    url = _configured_url(args)
    app_path = Path.home() / "Applications" / "Hermes Client.app"
    app_path.parent.mkdir(parents=True, exist_ok=True)
    script = f'on run\n  open location "{url.rstrip("/")}/chat"\nend run\n'
    subprocess.run(["osacompile", "-o", str(app_path), "-e", script], check=True)
    print(f"installed {app_path}")


def cmd_self_update(args) -> None:
    subprocess.run([str(Path(sys.executable)), "-m", "pip", "install", "-U", INSTALL_SPEC], check=True)


def _autoupdate_plist_path() -> Path:
    return Path.home() / "Library" / "LaunchAgents" / "com.sbbu.hermes-client.updater.plist"


def _worker_plist_path() -> Path:
    return Path.home() / "Library" / "LaunchAgents" / "com.sbbu.hermes-client.worker.plist"


def cmd_install_autoupdate(args) -> None:
    plist = _autoupdate_plist_path()
    log_dir = _state_dir()
    interval = max(3600, int(args.interval))
    data = {
        "Label": "com.sbbu.hermes-client.updater",
        "ProgramArguments": [str(Path(sys.executable)), "-m", "pip", "install", "-U", INSTALL_SPEC],
        "StartInterval": interval,
        "RunAtLoad": False,
        "StandardOutPath": str(log_dir / "autoupdate.log"),
        "StandardErrorPath": str(log_dir / "autoupdate.err"),
    }
    _write_launchd_plist(plist, data)
    _load_plist("com.sbbu.hermes-client.updater", plist)
    print(f"installed launchd autoupdater: {plist}")


def cmd_uninstall_autoupdate(args) -> None:
    plist = _autoupdate_plist_path()
    _unload_plist(plist)
    if plist.exists():
        plist.unlink()
    print("removed hermes-client autoupdater")


def cmd_install_worker(args) -> None:
    plist = _worker_plist_path()
    log_dir = _state_dir()
    roots = args.allow_root or load_config().worker_roots or _default_worker_roots()
    program = [
        str(Path(sys.executable)),
        "-m",
        "hermes_client.cli",
        "worker-service-run",
        "--host",
        args.host,
        "--port",
        str(args.port),
    ]
    for root in roots:
        program.extend(["--allow-root", str(Path(root).expanduser())])
    if args.allow_mutating_shell:
        program.append("--allow-mutating-shell")
    data = {
        "Label": "com.sbbu.hermes-client.worker",
        "ProgramArguments": program,
        "RunAtLoad": True,
        "KeepAlive": True,
        "ThrottleInterval": 30,
        "StandardOutPath": str(log_dir / "worker.log"),
        "StandardErrorPath": str(log_dir / "worker.err"),
    }
    _write_launchd_plist(plist, data)
    _load_plist("com.sbbu.hermes-client.worker", plist)
    print(f"installed launchd worker: {plist}")
    print("endpoint:")
    print(mcp_config_text(_resolve_worker_host(args.host, wait_seconds=0), args.port))


def cmd_uninstall_worker(args) -> None:
    plist = _worker_plist_path()
    _unload_plist(plist)
    if plist.exists():
        plist.unlink()
    print("removed hermes-client worker service")


def cmd_worker_status(args) -> None:
    host = _resolve_worker_host(args.host, wait_seconds=0)
    print(f"worker plist: {_worker_plist_path()}")
    if sys.platform == "darwin":
        subprocess.run(["launchctl", "list", "com.sbbu.hermes-client.worker"], check=False)
    print("endpoint:")
    print(mcp_config_text(host, args.port))


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="hermes-client")
    p.add_argument("--url", help="remote dashboard base URL; overrides saved config")
    p.set_defaults(func=cmd_tui, query=None, resume=None, inline=None, mouse=None)
    sub = p.add_subparsers(dest="cmd")

    c = sub.add_parser("configure")
    c.add_argument("--url", required=True)
    c.set_defaults(func=cmd_configure)

    c = sub.add_parser("status")
    c.add_argument("--url", default=argparse.SUPPRESS, help="remote dashboard base URL; overrides saved config")
    c.set_defaults(func=cmd_status)

    c = sub.add_parser("login")
    c.add_argument("--url", default=argparse.SUPPRESS, help="remote dashboard base URL; overrides saved config")
    c.add_argument("--provider", default="basic")
    c.add_argument("--username")
    c.set_defaults(func=cmd_login)

    c = sub.add_parser("open")
    c.add_argument("--url", default=argparse.SUPPRESS, help="remote dashboard base URL; overrides saved config")
    c.add_argument("--chat", action="store_true", default=True)
    c.set_defaults(func=cmd_open)

    c = sub.add_parser("chat")
    c.add_argument("--url", default=argparse.SUPPRESS, help="remote dashboard base URL; overrides saved config")
    c.add_argument("prompt", nargs="?")
    c.set_defaults(func=cmd_chat)

    c = sub.add_parser("tui")
    c.add_argument("--url", default=argparse.SUPPRESS, help="remote dashboard base URL; overrides saved config")
    c.add_argument("-q", "--query")
    c.add_argument("-r", "--resume")
    c.add_argument("--inline", action=argparse.BooleanOptionalAction, default=None)
    c.add_argument("--mouse", action=argparse.BooleanOptionalAction, default=None)
    c.set_defaults(func=cmd_tui)

    c = sub.add_parser("worker")
    c.add_argument("--host", default="auto")
    c.add_argument("--port", type=int, default=8766)
    c.add_argument("--allow-root", action="append", help="allowed local root; repeatable")
    c.add_argument("--allow-mutating-shell", action="store_true")
    c.set_defaults(func=cmd_worker)

    c = sub.add_parser("worker-service-run")
    c.add_argument("--host", default="auto")
    c.add_argument("--port", type=int, default=8766)
    c.add_argument("--allow-root", action="append")
    c.add_argument("--allow-mutating-shell", action="store_true")
    c.add_argument("--wait-seconds", type=int, default=-1)
    c.set_defaults(func=cmd_worker_service_run)

    c = sub.add_parser("mcp-config")
    c.add_argument("--host", default="auto")
    c.add_argument("--port", type=int, default=8766)
    c.set_defaults(func=cmd_mcp_config)

    c = sub.add_parser("install-worker")
    c.add_argument("--host", default="auto")
    c.add_argument("--port", type=int, default=8766)
    c.add_argument("--allow-root", action="append")
    c.add_argument("--allow-mutating-shell", action="store_true")
    c.set_defaults(func=cmd_install_worker)

    c = sub.add_parser("uninstall-worker")
    c.set_defaults(func=cmd_uninstall_worker)

    c = sub.add_parser("worker-status")
    c.add_argument("--host", default="auto")
    c.add_argument("--port", type=int, default=8766)
    c.set_defaults(func=cmd_worker_status)

    c = sub.add_parser("install-desktop-shortcut")
    c.add_argument("--url", default=argparse.SUPPRESS, help="remote dashboard base URL; overrides saved config")
    c.set_defaults(func=cmd_install_desktop_shortcut)

    c = sub.add_parser("self-update")
    c.set_defaults(func=cmd_self_update)

    c = sub.add_parser("install-autoupdate")
    c.add_argument("--interval", type=int, default=21600, help="update interval in seconds; default 21600 (6h)")
    c.set_defaults(func=cmd_install_autoupdate)

    c = sub.add_parser("uninstall-autoupdate")
    c.set_defaults(func=cmd_uninstall_autoupdate)

    return p


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
