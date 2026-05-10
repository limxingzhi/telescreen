#!/usr/bin/env bash
set -euo pipefail

ZSHRC=/root/.zshrc
NVIM_CONFIG_DIR="$HOME/.config/nvim"
NVIM_CONFIG="$NVIM_CONFIG_DIR/init.lua"
TS_STATE_DIR=/var/lib/tailscale
TS_SOCKET=/var/run/tailscale/tailscaled.sock

# Start Tailscale if auth key is provided
if [ -n "${TS_AUTHKEY:-}" ]; then
    echo "Starting Tailscale..."
    mkdir -p "$TS_STATE_DIR"
    rm -f "$TS_SOCKET"

    tailscaled --tun=userspace-networking \
        --state="$TS_STATE_DIR/tailscaled.state" \
        --socket="$TS_SOCKET" &>/tmp/tailscaled.log &

    # Wait for socket to be ready
    for i in $(seq 1 30); do
        if [ -S "$TS_SOCKET" ]; then
            break
        fi
        sleep 0.5
    done

    if [ ! -S "$TS_SOCKET" ]; then
        echo "ERROR: tailscaled failed to start"
        cat /tmp/tailscaled.log
        exit 1
    fi

    # Build tailscale up args
    TS_ARGS=""
    if [ -n "${TS_HOSTNAME:-}" ]; then
        TS_ARGS="$TS_ARGS --hostname=$TS_HOSTNAME"
    fi

    echo "Running tailscale up..."
    if ! timeout 30 tailscale up --authkey="$TS_AUTHKEY" $TS_ARGS --ssh --accept-risk=lose-ssh; then
        echo "WARNING: tailscale up failed or timed out"
        echo "tailscaled logs:"
        cat /tmp/tailscaled.log
    else
        echo "Tailscale connected (SSH enabled)"
    fi
fi

# Bootstrap .zshrc if missing (Oh My Zsh template from /opt)
if [ ! -f "$ZSHRC" ]; then
  cp /opt/oh-my-zsh/templates/zshrc.zsh-template "$ZSHRC"
  sed -i "s|export ZSH=.*|export ZSH=/opt/oh-my-zsh|" "$ZSHRC"
fi

mkdir -p "$NVIM_CONFIG_DIR"
if [ ! -f "$NVIM_CONFIG" ]; then
  echo "No local Neovim config found, using default"
  cp /etc/nvim/init.lua "$NVIM_CONFIG"
else
  echo "Using existing Neovim config"
fi

grep -qxF 'source /etc/zsh/aliases.zsh' "$ZSHRC" 2>/dev/null || echo 'source /etc/zsh/aliases.zsh' >> "$ZSHRC"

# If stdin is a tty, exec into the shell. Otherwise just keep the container alive.
if [ -t 0 ]; then
    exec "$@"
else
    exec "$@" <&0 &
    wait
fi
