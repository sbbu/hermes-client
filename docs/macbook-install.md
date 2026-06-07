# MacBook install

1. Install client:

```bash
curl -fsSL https://raw.githubusercontent.com/sbbu/hermes-client/main/scripts/install.sh | bash
export PATH="$HOME/.local/bin:$PATH"
```

The installer uses `uv` to create a standalone Python 3.11 venv under `~/.local/share/hermes-client`, symlinks `~/.local/bin/hermes-client`, and installs a 6-hour launchd self-updater. It does not depend on stock Hermes surviving.

2. Configure remote mini dashboard:

```bash
hermes-client configure --url http://<mini-tailscale-ip>:9119
hermes-client status
hermes-client open
```

3. If status works, uninstall stock Hermes locally:

```bash
hermes uninstall
rm -rf ~/Applications/Hermes.app
sudo rm -rf /Applications/Hermes.app
exec zsh -l
```

4. Verify:

```bash
command -v hermes || echo "stock hermes gone"
command -v hermes-client
hermes-client status
```
