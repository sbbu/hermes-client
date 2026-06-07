from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

APP_DIR = Path(os.environ.get("HERMES_CLIENT_HOME", Path.home() / ".config" / "hermes-client"))
CONFIG_PATH = APP_DIR / "config.json"
COOKIES_PATH = APP_DIR / "cookies.json"


def _chmod_private(path: Path) -> None:
    try:
        path.chmod(0o600)
    except OSError:
        pass


def ensure_app_dir() -> Path:
    APP_DIR.mkdir(parents=True, exist_ok=True)
    try:
        APP_DIR.chmod(0o700)
    except OSError:
        pass
    return APP_DIR


@dataclass
class ClientConfig:
    base_url: str = ""
    worker_roots: list[str] | None = None
    allow_mutating_shell: bool = False

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "ClientConfig":
        roots = raw.get("worker_roots")
        if roots is not None and not isinstance(roots, list):
            roots = None
        return cls(
            base_url=str(raw.get("base_url") or ""),
            worker_roots=[str(x) for x in roots] if roots is not None else None,
            allow_mutating_shell=bool(raw.get("allow_mutating_shell", False)),
        )


def load_config(path: Path = CONFIG_PATH) -> ClientConfig:
    if not path.exists():
        return ClientConfig()
    try:
        return ClientConfig.from_dict(json.loads(path.read_text()))
    except Exception:
        return ClientConfig()


def save_config(cfg: ClientConfig, path: Path = CONFIG_PATH) -> None:
    ensure_app_dir()
    path.write_text(json.dumps(asdict(cfg), indent=2, sort_keys=True) + "\n")
    _chmod_private(path)


def save_cookies(cookies: list[dict[str, Any]], path: Path = COOKIES_PATH) -> None:
    ensure_app_dir()
    path.write_text(json.dumps(cookies, indent=2, sort_keys=True) + "\n")
    _chmod_private(path)


def load_cookies(path: Path = COOKIES_PATH) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    try:
        raw = json.loads(path.read_text())
    except Exception:
        return []
    return raw if isinstance(raw, list) else []
