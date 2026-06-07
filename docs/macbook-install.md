# MacBook install

1. Install client:

```bash
curl -fsSL https://raw.githubusercontent.com/sbbu/hermes-client/main/scripts/install.sh | bash
export PATH="$HOME/.local/bin:$PATH"
```

2. Configure remote mini dashboard:

```bash
hermes-client configure --url http://100.79.212.87:9119
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
