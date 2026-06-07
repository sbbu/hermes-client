from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode, urlsplit, urlunsplit

import httpx

from .config import load_cookies, save_cookies

TOKEN_RE = re.compile(r'window\.__HERMES_SESSION_TOKEN__="([^"]+)"')


def normalize_base_url(raw: str) -> str:
    raw = (raw or "").strip()
    if not raw:
        raise ValueError("remote URL is required")
    if "://" not in raw:
        raw = "http://" + raw
    parts = urlsplit(raw)
    if parts.scheme not in {"http", "https"}:
        raise ValueError("remote URL must be http:// or https://")
    if not parts.netloc:
        raise ValueError("remote URL is missing host")
    path = parts.path.rstrip("/")
    return urlunsplit((parts.scheme, parts.netloc, path, "", ""))


def http_to_ws_scheme(scheme: str) -> str:
    if scheme == "https":
        return "wss"
    if scheme == "http":
        return "ws"
    raise ValueError(f"unsupported scheme: {scheme}")


def build_ws_url(base_url: str, credential_name: str, credential_value: str) -> str:
    base_url = normalize_base_url(base_url)
    parts = urlsplit(base_url)
    path = parts.path.rstrip("/") + "/api/ws"
    query = urlencode({credential_name: credential_value})
    return urlunsplit((http_to_ws_scheme(parts.scheme), parts.netloc, path, query, ""))


def extract_session_token(html: str) -> str | None:
    m = TOKEN_RE.search(html or "")
    return m.group(1) if m else None


@dataclass
class DashboardClient:
    base_url: str

    def __post_init__(self) -> None:
        self.base_url = normalize_base_url(self.base_url)
        self.client = httpx.Client(base_url=self.base_url, follow_redirects=True, timeout=20.0)
        for cookie in load_cookies():
            try:
                self.client.cookies.set(
                    str(cookie["name"]),
                    str(cookie["value"]),
                    domain=cookie.get("domain"),
                    path=cookie.get("path") or "/",
                )
            except Exception:
                continue

    def close(self) -> None:
        self.client.close()

    def _cookie_dump(self) -> list[dict[str, Any]]:
        dumped: list[dict[str, Any]] = []
        for c in self.client.cookies.jar:
            dumped.append({"name": c.name, "value": c.value, "domain": c.domain, "path": c.path})
        return dumped

    def status(self) -> dict[str, Any]:
        r = self.client.get("/api/status")
        r.raise_for_status()
        return r.json()

    def login_password(self, provider: str, username: str, password: str) -> dict[str, Any]:
        r = self.client.post(
            "/auth/password-login",
            json={"provider": provider, "username": username, "password": password, "next": "/"},
        )
        r.raise_for_status()
        save_cookies(self._cookie_dump())
        return r.json()

    def websocket_url(self) -> str:
        status = self.status()
        if status.get("auth_required"):
            r = self.client.post("/api/auth/ws-ticket")
            r.raise_for_status()
            ticket = str(r.json()["ticket"])
            return build_ws_url(self.base_url, "ticket", ticket)

        r = self.client.get("/")
        r.raise_for_status()
        token = extract_session_token(r.text)
        if not token:
            raise RuntimeError("dashboard did not expose a session token; if auth is enabled run `hermes-client login`")
        return build_ws_url(self.base_url, "token", token)
