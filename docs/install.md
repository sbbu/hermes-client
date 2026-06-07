# Client install

Install:

```bash
curl -fsSL https://raw.githubusercontent.com/sbbu/hermes-client/main/scripts/install.sh | bash
export PATH="$HOME/.local/bin:$PATH"
```

The installer uses `uv` to create a standalone Python 3.11 venv under `~/.local/share/hermes-client`, installs a local Node.js runtime if the machine does not already have one, symlinks `~/.local/bin/hermes-client`, installs a 6-hour launchd self-updater, and installs the local worker as a launchd service.

Configure a remote Hermes dashboard:

```bash
hermes-client configure --url http://<remote-host-or-tailscale-ip>:9119
hermes-client status
```

Run the full TUI:

```bash
hermes-client
# or
hermes-client tui
```

Open the dashboard in a browser:

```bash
hermes-client open
```
