from __future__ import annotations

import argparse
import getpass
import subprocess
import sys
import webbrowser
from pathlib import Path

from .chat import chat_sync
from .config import load_config, save_config
from .dashboard import DashboardClient, normalize_base_url
from .worker import mcp_config_text, run_worker


def _configured_url(args) -> str:
    raw = getattr(args, "url", None) or load_config().base_url
    if not raw:
        raise SystemExit("no remote URL configured; run `hermes-client configure --url http://HOST:9119`")
    return normalize_base_url(raw)


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


def cmd_worker(args) -> None:
    roots = args.allow_root or load_config().worker_roots or []
    run_worker(args.host, args.port, roots, allow_mutating_shell=args.allow_mutating_shell)


def cmd_mcp_config(args) -> None:
    print(mcp_config_text(args.host, args.port))


def cmd_install_desktop_shortcut(args) -> None:
    url = _configured_url(args)
    app_path = Path.home() / "Applications" / "Hermes Client.app"
    app_path.parent.mkdir(parents=True, exist_ok=True)
    script = f'on run\n  open location "{url.rstrip("/")}/chat"\nend run\n'
    subprocess.run(["osacompile", "-o", str(app_path), "-e", script], check=True)
    print(f"installed {app_path}")


def cmd_self_update(args) -> None:
    exe = Path(sys.executable)
    subprocess.run([str(exe), "-m", "pip", "install", "-U", "git+https://github.com/sbbu/hermes-client.git"], check=True)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="hermes-client")
    p.add_argument("--url", help="remote dashboard base URL; overrides saved config")
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("configure")
    c.add_argument("--url", required=True)
    c.set_defaults(func=cmd_configure)

    c = sub.add_parser("status")
    c.set_defaults(func=cmd_status)

    c = sub.add_parser("login")
    c.add_argument("--provider", default="basic")
    c.add_argument("--username")
    c.set_defaults(func=cmd_login)

    c = sub.add_parser("open")
    c.add_argument("--chat", action="store_true", default=True)
    c.set_defaults(func=cmd_open)

    c = sub.add_parser("chat")
    c.add_argument("prompt", nargs="?")
    c.set_defaults(func=cmd_chat)

    c = sub.add_parser("worker")
    c.add_argument("--host", default="127.0.0.1")
    c.add_argument("--port", type=int, default=8766)
    c.add_argument("--allow-root", action="append", help="allowed local root; repeatable")
    c.add_argument("--allow-mutating-shell", action="store_true")
    c.set_defaults(func=cmd_worker)

    c = sub.add_parser("mcp-config")
    c.add_argument("--host", required=True)
    c.add_argument("--port", type=int, default=8766)
    c.set_defaults(func=cmd_mcp_config)

    c = sub.add_parser("install-desktop-shortcut")
    c.set_defaults(func=cmd_install_desktop_shortcut)

    c = sub.add_parser("self-update")
    c.set_defaults(func=cmd_self_update)

    return p


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
