#!/usr/bin/env bash
set -euo pipefail

ZSHRC=/root/.zshrc
NVIM_CONFIG_DIR="$HOME/.config/nvim"
NVIM_CONFIG="$NVIM_CONFIG_DIR/init.lua"
TMUX_CONFIG="$HOME/.tmux.conf"
TS_STATE_DIR=/var/lib/tailscale
TS_SOCKET=/var/run/tailscale/tailscaled.sock

# Set timezone if TZ is provided
if [ -n "${TZ:-}" ]; then
    ln -snf /usr/share/zoneinfo/"$TZ" /etc/localtime
    echo "$TZ" > /etc/timezone
fi

# Bootstrap .zshrc if missing (Oh My Zsh template from /opt)
if [ ! -f "$ZSHRC" ]; then
  cp /opt/oh-my-zsh/templates/zshrc.zsh-template "$ZSHRC"
  sed -i "s|export ZSH=.*|export ZSH=/opt/oh-my-zsh|" "$ZSHRC"
fi

# Link tmux config if not present
if [ ! -f "$TMUX_CONFIG" ]; then
    ln -s /etc/tmux/tmux.conf "$TMUX_CONFIG"
fi

# Copy tmux plugins if not present
if [ ! -d /root/.tmux/plugins/tpm ]; then
    mkdir -p /root/.tmux/plugins
    cp -r /opt/tmux-plugins/tpm /root/.tmux/plugins/tpm
    cp -r /opt/tmux-plugins/tmux-yank /root/.tmux/plugins/tmux-yank 2>/dev/null || true
fi

# Ensure Crush config exists in default data path (prevents first-run override)
mkdir -p /root/.local/share/crush
if [ ! -f /root/.local/share/crush/crush.json ]; then
    cp /etc/crush/crush.json /root/.local/share/crush/crush.json
fi

# Move skills to .config/agents/skills
mkdir -p /root/.config/agents/skills
for item in /etc/agents/skills/*; do
    name=$(basename "$item")

    if [ ! -e "/root/.config/agents/skills/$name" ]; then
        cp -r "$item" /root/.config/agents/skills
    else
        echo "Skipping existing: $name"
    fi
done

# Start Tailscale if auth key is provided
if [ -n "${TS_AUTHKEY:-}" ]; then
    echo "Starting Tailscale..."
    mkdir -p "$TS_STATE_DIR"
    rm -f "$TS_SOCKET"

    if [ -c /dev/net/tun ]; then
        echo "Starting Tailscale (tun mode)..."
        tailscaled --state="$TS_STATE_DIR/tailscaled.state" \
            --socket="$TS_SOCKET" &>/tmp/tailscaled.log &
    else
        echo "Starting Tailscale (userspace mode)..."
        tailscaled --tun=userspace-networking \
            --state="$TS_STATE_DIR/tailscaled.state" \
            --socket="$TS_SOCKET" &>/tmp/tailscaled.log &
    fi

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
    if [ -c /dev/net/tun ]; then
        TS_ARGS="$TS_ARGS --netfilter-mode=off"
    fi

    echo "Running tailscale up..."
    if ! timeout 30 tailscale up --authkey="$TS_AUTHKEY" $TS_ARGS --ssh --accept-risk=lose-ssh; then
        echo "WARNING: tailscale up failed or timed out"
        echo "tailscaled logs:"
        cat /tmp/tailscaled.log
    else
        if [ -c /dev/net/tun ]; then
            echo "Tailscale connected (tun mode, SSH enabled)"
        else
            echo "Tailscale connected (userspace mode, SSH enabled)"
        fi
    fi
fi


mkdir -p "$NVIM_CONFIG_DIR"
if [ ! -f "$NVIM_CONFIG" ]; then
    echo "Fetching Neovim config from Gist..."
    if curl -fsSL https://gist.github.com/limxingzhi/fa3be5045caded9d4e09f2423dbfcec7/raw -o "$NVIM_CONFIG" 2>/dev/null; then
        echo "Config fetched successfully"
    else
        echo "Gist fetch failed, using default config"
        cp /etc/nvim/init.lua "$NVIM_CONFIG"
    fi
else
    echo "Using existing Neovim config"
fi

grep -qxF 'source /etc/zsh/init.zsh' "$ZSHRC" 2>/dev/null || echo 'source /etc/zsh/init.zsh' >> "$ZSHRC"

# If stdin is a tty, exec into the shell. Otherwise just keep the container alive.
if [ -t 0 ]; then
    exec "$@"
else
    exec "$@" <&0 &
    wait
fi
