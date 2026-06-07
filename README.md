# hermes-client

Remote-only client tooling for Hermes Agent.

This repo deliberately does **not** install or run a local Hermes agent. A remote Hermes host remains the brain/gateway/memory/skills machine. The local machine gets:

- `hermes-client` / `hermes-client tui` — the full Hermes Ink TUI, attached to a remote dashboard gateway.
- `hermes-client status` — check the remote dashboard.
- `hermes-client open` — open the remote dashboard/chat in the browser.
- `hermes-client chat` — small non-TUI terminal chat over `/api/ws`.
- `hermes-client install-worker` — launchd service exposing scoped local file/shell MCP tools to the remote Hermes host.
- `hermes-client install-desktop-shortcut` — tiny macOS `.app` launcher for the remote dashboard.

No local agent checkout. No local gateway brain. No `hermes update` path.

## install

```bash
curl -fsSL https://raw.githubusercontent.com/sbbu/hermes-client/main/scripts/install.sh | bash
export PATH="$HOME/.local/bin:$PATH"
```

The installer creates a standalone Python environment under `~/.local/share/hermes-client`, installs a local Node.js runtime if needed for the TUI, installs a launchd self-updater, and installs the local worker as a launchd service.

## connect to a remote Hermes host

```bash
hermes-client configure --url http://<remote-host-or-tailscale-ip>:9119
hermes-client status
```

If the dashboard has username/password auth enabled:

```bash
hermes-client login --provider basic --username <username>
```

If the dashboard has `auth_required=false` on a private tailnet, login is not needed; the client discovers the dashboard session token from the served SPA.

## full TUI

```bash
hermes-client
# same as:
hermes-client tui
```

Useful variants:

```bash
hermes-client tui -q "say ok"
hermes-client tui --resume <session-id>
hermes-client tui --no-mouse
hermes-client tui --inline
```

This runs the same bundled Ink TUI used by `hermes --tui`, but attaches it to the remote dashboard gateway through `HERMES_TUI_GATEWAY_URL` instead of spawning a local agent.

## lightweight chat

```bash
hermes-client chat
hermes-client chat "say ok"
```

This is intentionally plain; use `hermes-client tui` for the full terminal experience.

## local worker service

The installer runs this automatically:

```bash
hermes-client install-worker
```

By default it creates a launchd service that starts at login, waits for the machine's Tailscale IPv4 address, binds to it, and exposes only common local work roots that already exist (`~/code`, `~/src`, `~/Developer`, `~/Documents`).

Inspect the service and print remote-host MCP config:

```bash
hermes-client worker-status
hermes-client mcp-config
```

Manual worker install with explicit roots:

```bash
hermes-client install-worker --allow-root ~/code --allow-root ~/Documents
```

The worker exposes:

- `local_info`
- `local_read_file`
- `local_write_file`
- `local_search_files`
- `local_run`
- `local_computer_use_status`

Shell commands run without `sudo`; mutating/destructive-looking shell commands are blocked unless the worker is installed with `--allow-mutating-shell`. File writes are allowed inside configured roots.

## desktop launcher

```bash
hermes-client install-desktop-shortcut
open ~/Applications/Hermes\ Client.app
```

## updates

The installer creates a LaunchAgent that self-updates every 6h. Manual commands:

```bash
hermes-client self-update
hermes-client install-autoupdate --interval 21600
hermes-client uninstall-autoupdate
```
