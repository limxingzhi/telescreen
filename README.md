# Dev Environment (Node + TypeScript + Neovim)

A lightweight, reproducible containerized development environment. Boots into zsh with neovim, tmux, lazygit, TypeScript tooling, and Oh My Zsh pre-configured. Neovim config is auto-fetched from a GitHub Gist on every start, so the container stays up to date without rebuilding.

Supports **Tailscale SSH** — connect to your container from anywhere on your tailnet without exposing ports.

## What's Included

- **Node.js 24** + npm (latest)
- **TypeScript** (`tsc`, `ts-node`)
- **Neovim** (set as `EDITOR`/`VISUAL`)
- **tmux** + **lazygit**
- **Oh My Zsh**
- **ripgrep**, **fd-find**, **git**, **curl**, **wget**
- **Tailscale** (with SSH support)
- Shell aliases: `n` → `npm`, `nr` → `npm run`, `tat` → tmux session switcher

## Quick Start

```sh
# Build
docker build -t dev-env .

# Run (persist home directory)
docker run -it --rm -v dev-env-home:/root dev-env
```

### With Git credentials

```sh
docker run -it --rm \
  -v dev-env-home:/root \
  -v ~/.gitconfig:/root/.gitconfig:ro \
  -v ~/.ssh:/root/.ssh:ro \
  dev-env
```

### With Tailscale SSH

```sh
docker run -it --rm \
  -v dev-env-home:/root \
  -v tailscale-state:/var/lib/tailscale \
  -v ~/.gitconfig:/root/.gitconfig:ro \
  -e TS_AUTHKEY=tskey-auth-xxxxx \
  -e TS_HOSTNAME=my-dev-env \
  dev-env
```

Then SSH in from any device on your tailnet:

```sh
ssh root@my-dev-env
```

No ports to expose. Tailscale handles authentication and encryption.

Home directory and Tailscale state are persisted as separate Docker volumes. On subsequent starts, just omit `TS_AUTHKEY`.

### docker-compose

```yaml
services:
  workspace_01:
    image: ghcr.io/limxingzhi/dockerized-env:2026.05.11
    container_name: workspace_01
    volumes:
      - /volume1/docker/dev_container/workspace_01:/root
      - /volume1/docker/dev_container/config/.ssh:/root/.ssh
      - /volume1/docker/dev_container/config/.gitconfig:/root/.gitconfig
      - ws_01_ts_state:/var/lib/tailscale
    environment:
      - TS_AUTHKEY=tskey-auth-keygoeshere
      - TS_HOSTNAME=dev01
    network_mode: host

volumes:
  ws_01_ts_state:
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TS_AUTHKEY` | Tailscale auth key. Required on first run; optional after that if state is persisted. Generate one at [tailscale.com/admin/settings/keys](https://login.tailscale.com/admin/settings/keys). |
| `TS_HOSTNAME` | Hostname for the Tailscale node (e.g. `my-dev-env` → SSH via `ssh root@my-dev-env`) |

## Neovim Config

On startup, the container fetches a neovim config from a [GitHub Gist](https://gist.github.com/limxingzhi/fa3be5045caded9d4e09f2423dbfcec7). If the fetch fails, it falls back to a default config bundled in the image.

To use your own config, mount it:

```sh
docker run -it --rm -v ./my-init.lua:/root/.config/nvim/init.lua dev-env
```

## Multi-Architecture

Images are built for **linux/amd64** and **linux/arm64** and published to GHCR on every push to `main`.

## Notes

- Designed for fast, reproducible dev environments — safe to rebuild anytime
- Works with VS Code Dev Containers (optional)
- Image tags: `latest` + date-based (`YYYY.MM.DD`)
- Uses Tailscale **userspace networking** — no special Docker capabilities (`--cap-add`) needed
- Two volumes: `/root` for configs/projects, `/var/lib/tailscale` for Tailscale state
- Tailscale SSH requires an [ACL policy](https://login.tailscale.com/admin/acls) that allows SSH access
