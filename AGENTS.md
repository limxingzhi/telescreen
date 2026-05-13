# AGENTS.md

## Overview

Docker dev environment on `node:24-bookworm`: neovim, tmux, lazygit, TypeScript, Oh My Zsh, Crush, Glow, Tailscale SSH. Published to `ghcr.io` for `linux/amd64`+`linux/arm64`. No tests or linting.

**Branch tags**: `main` → `latest` + `YYYY.MM.DD` | `dev` → `dev` + `dev-YYYY.MM.DD`

## Commands

| Action | Command |
|--------|---------|
| Build | `docker build -t dockerized-env .` |
| Run | `docker run -it --rm dockerized-env` |
| Persistent home | `docker run -it --rm -v dev-env-home:/root dockerized-env` |
| Timezone | `-e TZ=America/New_York` |
| Tailscale SSH | `-v tailscale-state:/var/lib/tailscale -e TS_AUTHKEY=tskey-auth-xxx -e TS_HOSTNAME=my-dev-env` |
| Crush | `-e ZAI_API_KEY=your-key` |
| Multi-arch | `docker buildx build --platform linux/amd64,linux/arm64 -t dockerized-env .` |

## Architecture

```
Dockerfile                    → Image (packages, Crush, Glow, Oh My Zsh, TS, Deno, tmux plugins, entrypoint)
entrypoint.sh                 → Runtime: Tailscale, tmux, plugins, neovim config, aliases
crush/crush.json              → Crush config (zai provider, $ZAI_API_KEY) → /etc/crush/crush.json
tmux/tmux.conf                → Mouse, vi copy, tmux-yank, popup, renumber hooks
tmux/popup.sh                 → Scratch popup (prefix+s)
tmux/renumber-sess.sh         → Renumber numeric sessions
zsh/aliases.zsh               → n, nr, tat
skills/                       → Crush skills → /etc/agents/skills/
.github/workflows/publish.yml → Multi-arch GHCR publish
```

**Startup** (runs as root): set TZ → bootstrap `.zshrc` → symlink tmux.conf → copy plugins from `/opt/tmux-plugins/` → copy Crush skills → fetch neovim config from Gist (fallback `/etc/nvim/init.lua`) → start `tailscaled` if `TS_AUTHKEY` set → append aliases (idempotent) → `exec "$@"` (zsh)

## Key Details

- **Root, home as workspace** — no `USER` directive, `WORKDIR=/root`, mount volume to persist.
- **Configs in `/etc/`** — survive volume mounts on `/root` (tmux, Crush, nvim fallback).
- **Tailscale**: `pkgs.tailscale.com` apt repo. Userspace networking (no `--cap-add`). State in `/var/lib/tailscale` volume. SSH via `--ssh` (needs Tailscale ACL). Runs unsupervised in background — crash kills SSH, not container. Socket poll up to 15s.
- **tmux**: `/etc/tmux/tmux.conf` symlinked. Plugins at build → `/opt/tmux-plugins/`, copied at runtime. tmux-yank via OSC 52 (no `xsel`). Popup `prefix+s`. Renumber on create/close/rename.
- **Neovim**: Runtime fetch from Gist, fallback `/etc/nvim/init.lua`. Gist URL hardcoded in `entrypoint.sh`.
- **Crush**: `.deb` from GitHub releases. Config `/etc/crush/crush.json`. Z.AI provider with `$ZAI_API_KEY`.
- **CI**: GHA BuildKit cache. Date tags (not semver) — same-day pushes overwrite. No `.dockerignore`.

## Preferences

- Commit only, never push unless asked. Keep AGENTS.md in sync.
- No hardcoded secrets — `$ENV_VAR` only. Scan staged files before committing.

## Gotchas

- `tailscaled` unsupervised — crash breaks SSH only. Socket poll 15s (not `sleep`).
- No `.dockerignore` — full context on every build.
- Same-day pushes overwrite date tag.
- Neovim Gist URL hardcoded.
- Tailscale SSH needs ACL policy in admin console.
- tmux-yank OSC 52 only — no support in some terminals (e.g. older PuTTY).
