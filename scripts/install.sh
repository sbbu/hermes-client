#!/usr/bin/env bash
set -euo pipefail

PREFIX="${HERMES_CLIENT_PREFIX:-$HOME/.local/share/hermes-client}"
BIN_DIR="${HERMES_CLIENT_BIN_DIR:-$HOME/.local/bin}"
UV="${UV:-$HOME/.local/bin/uv}"

mkdir -p "$PREFIX" "$BIN_DIR"

if ! command -v "$UV" >/dev/null 2>&1; then
  if command -v uv >/dev/null 2>&1; then
    UV="$(command -v uv)"
  else
    echo "installing uv so hermes-client gets its own Python and survives stock Hermes uninstall..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
  fi
fi

if ! command -v "$UV" >/dev/null 2>&1; then
  UV="$(command -v uv)"
fi

"$UV" venv --python 3.11 "$PREFIX/venv"
"$UV" pip install --python "$PREFIX/venv/bin/python" --upgrade 'git+https://github.com/sbbu/hermes-client.git[worker]'
ln -sf "$PREFIX/venv/bin/hermes-client" "$BIN_DIR/hermes-client"
"$BIN_DIR/hermes-client" install-autoupdate || true

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.zshrc"
    echo "added ~/.local/bin to ~/.zshrc; open a new terminal or run: export PATH=\"$HOME/.local/bin:\$PATH\""
    ;;
esac

echo "installed: $BIN_DIR/hermes-client"
echo "next: hermes-client configure --url http://<mini-tailscale-ip>:9119 && hermes-client status"
