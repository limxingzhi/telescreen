# AGENTS.md

## Overview

Docker dev environment on `node:24-bookworm`: neovim, tmux, lazygit, TypeScript, Oh My Zsh, Crush, Glow, Tailscale SSH. Published to `ghcr.io` for `linux/amd64`+`linux/arm64`. No tests or linting.

**Branch tags**: `main` -> `latest` + `YYYY.MM.DD` | `dev` -> `dev` + `dev-YYYY.MM.DD`

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

No test suite, no linter. Verify changes with `docker build`.

## Architecture

```
Dockerfile
  ├─ entrypoint.sh          → Runtime orchestrator (runs as root)
  │    ├─ sets TZ
  │    ├─ bootstraps .zshrc → sources init.zsh
  │    ├─ symlinks tmux.conf → /etc/tmux/tmux.conf
  │    ├─ copies plugins    → /opt/tmux-plugins/ → ~/.tmux/plugins/
  │    ├─ copies skills     → /etc/agents/skills/
  │    ├─ fetches nvim config from Gist (fallback /etc/nvim/init.lua)
  │    ├─ starts tailscaled if TS_AUTHKEY set
  │    ├─ appends aliases (idempotent)
  │    └─ exec "$@" (zsh)
  │
  ├─ crush/crush.json       → /etc/crush/crush.json (zai provider, $ZAI_API_KEY, LSPs)
  ├─ init.zsh               → Shell env (EDITOR, aliases, tat fn)
  ├─ tmux/
  │    ├─ tmux.conf         → /etc/tmux/tmux.conf (mouse, vi copy, yank, popup, renumber)
  │    ├─ popup.sh          → Scratch popup (prefix+s)
  │    ├─ session-status.sh → Status-right: * before hostname if scratch exists
  │    └─ renumber-sess.sh  → Renumber numeric sessions
  ├─ skills/                → /etc/agents/skills/
  └─ .github/workflows/publish.yml → Multi-arch GHCR publish
```

Configs live in `/etc/` so they survive volume mounts on `/root`.

## Preferences

- Commit only, never push unless asked. Keep AGENTS.md in sync.
- No hardcoded secrets - `$ENV_VAR` only. Scan staged files before committing.
- Commit messages: lowercase, imperative, no period (e.g. `add scratch session indicator`).
- Follow existing file naming and code style. Match what's already there.

## Gotchas

- `tailscaled` unsupervised - crash breaks SSH only, not the container. Socket poll up to 15s.
- No `.dockerignore` - full build context sent on every build.
- Same-day pushes overwrite date tag.
- Neovim Gist URL hardcoded in `entrypoint.sh`.
- Tailscale SSH needs ACL policy in admin console.
- tmux-yank OSC 52 only - no clipboard support in some terminals.
- tmux plugins pre-installed at build time (TPM + tmux-yank), linked on first start.
- Scratch sessions (`scratch-*`) are persistent - they survive popup close, not killed automatically.
