from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode, urlsplit, urlunsplit

import httpx

from .config import load_cookies, save_cookies

TOKEN_RE = re.compile(r'window\.__HERMES_SESSION_TOKEN__="([^"]+)"')
TAILSCALE_NET = ipaddress.ip_network("100.64.0.0/10")


class DashboardConnectionError(RuntimeError):
    """Raised when the remote Hermes dashboard cannot be reached."""


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


def _host_hint(base_url: str) -> str:
    parts = urlsplit(base_url)
    host = parts.hostname or parts.netloc or "remote host"
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None

    if ip and ip in TAILSCALE_NET:
        return (
            "- this is a Tailscale IP; make sure Tailscale is running and logged in on this machine, "
            "and that the remote Hermes machine is online on the tailnet"
        )
    if host in {"127.0.0.1", "::1", "localhost"}:
        return "- localhost points at this machine; use the remote Hermes machine's Tailscale/LAN URL instead"
    return "- if this host is only reachable through a VPN/tailnet, make sure that network is connected"


def _connection_error_message(base_url: str, exc: httpx.HTTPError) -> str:
    status_url = base_url.rstrip("/") + "/api/status"
    lines = [
        f"could not reach Hermes dashboard at {base_url}",
        f"httpx: {type(exc).__name__}: {exc}",
        "",
        "check:",
        f"- configured remote URL is correct: {base_url}",
        "- the remote dashboard service is running and listening on that host/port",
        _host_hint(base_url),
        f"- try: curl --connect-timeout 5 {status_url}",
    ]
    return "\n".join(lines)


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
        try:
            r = self.client.get("/api/status")
        except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as exc:
            raise DashboardConnectionError(_connection_error_message(self.base_url, exc)) from exc
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
