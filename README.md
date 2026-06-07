# hermes-client

Remote-only client tooling for Jeremy's Hermes setup.

This repo deliberately does **not** install or run a local Hermes agent. The Mac mini remains the 24/7 brain/gateway/memory/skills machine. The MacBook gets:

- `hermes-client status` — check the remote dashboard.
- `hermes-client open` — open the remote dashboard/chat in the browser.
- `hermes-client chat` — lightweight terminal chat over the dashboard `/api/ws` JSON-RPC protocol.
- `hermes-client worker` — a local MCP tool worker exposing scoped MacBook file/shell tools to the Mac mini over Tailscale.
- `hermes-client install-desktop-shortcut` — creates a tiny macOS `.app` launcher for the remote dashboard.

No stock `hermes update`; no local `~/.hermes/hermes-agent`; no duplicate memory/skills.

## install on the MacBook

```bash
curl -fsSL https://raw.githubusercontent.com/sbbu/hermes-client/main/scripts/install.sh | bash
```

Then configure it to the Mac mini dashboard:

```bash
hermes-client configure --url http://100.79.212.87:9119
hermes-client status
hermes-client open
```

If the remote dashboard has username/password auth enabled:

```bash
hermes-client login --provider basic --username <username>
```

For Jeremy's current mini dashboard (`auth_required=false` on Tailscale), login is not needed; the client discovers the dashboard session token from the served SPA exactly like the browser does.

## terminal chat

```bash
hermes-client chat
```

This creates a remote TUI-gateway session over `/api/ws`, submits prompts with `prompt.submit`, streams `message.delta`, and prints the final `message.complete`. It's intentionally plain and small; the full Ink TUI/desktop fork can come later without blocking uninstalling stock Hermes locally.

## local MacBook worker

Run this on the MacBook when you want the mini Hermes to work on local files/repos:

```bash
hermes-client worker --host 100.x.y.z --port 8766 --allow-root ~/code --allow-root ~/Documents
```

Then add the printed MCP config to the Mac mini Hermes config. Example:

```yaml
mcp_servers:
  macbook:
    url: "http://100.x.y.z:8766/mcp"
    enabled: true
    timeout: 120
    connect_timeout: 30
    tools:
      resources: false
      prompts: false
```

The worker exposes only paths under configured allow-roots. Shell commands run without `sudo`; mutating/destructive-looking shell commands are blocked unless you pass `--allow-mutating-shell`. File writes are still allowed inside allow-roots because local dev work needs them.

## desktop launcher

```bash
hermes-client install-desktop-shortcut
open ~/Applications/Hermes\ Client.app
```

This is a tiny native macOS launcher around the remote dashboard. It has no updater yet because there is nothing agent-side to update locally; the client CLI updates with:

```bash
hermes-client self-update
```

## uninstall stock Hermes from the MacBook

After `hermes-client status` works, remove stock Hermes locally:

```bash
hermes uninstall
# choose full uninstall if you don't need MacBook-local ~/.hermes data
rm -rf ~/Applications/Hermes.app
sudo rm -rf /Applications/Hermes.app
exec zsh -l
```

Then verify:

```bash
command -v hermes || echo "stock hermes gone"
command -v hermes-client
hermes-client status
```

## current scope

v0.1 is intentionally the practical cut:

- working remote dashboard status/open
- working remote JSON-RPC terminal chat
- working local MCP worker for MacBook files/shell
- macOS app launcher

Not yet in v0.1:

- full Electron desktop fork with GitHub auto-updater
- full Ink TUI vendored into this repo
- remote MacBook `computer_use` bridge

Those are next-layer work. The point of v0.1 is to let the MacBook stop carrying stock Hermes without losing access to the mini brain or local MacBook dev tooling.
