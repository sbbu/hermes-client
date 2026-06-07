#!/usr/bin/env bash
set -euo pipefail

PREFIX="${HERMES_CLIENT_PREFIX:-$HOME/.local/share/hermes-client}"
BIN_DIR="${HERMES_CLIENT_BIN_DIR:-$HOME/.local/bin}"
PYTHON="${PYTHON:-python3}"

mkdir -p "$PREFIX" "$BIN_DIR"
"$PYTHON" -m venv "$PREFIX/venv"
"$PREFIX/venv/bin/python" -m pip install --upgrade pip
"$PREFIX/venv/bin/python" -m pip install --upgrade 'git+https://github.com/sbbu/hermes-client.git[worker]'
ln -sf "$PREFIX/venv/bin/hermes-client" "$BIN_DIR/hermes-client"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.zshrc"
    echo "added ~/.local/bin to ~/.zshrc; open a new terminal or run: export PATH=\"$HOME/.local/bin:\$PATH\""
    ;;
esac

echo "installed: $BIN_DIR/hermes-client"
echo "next: hermes-client configure --url http://100.79.212.87:9119 && hermes-client status"
