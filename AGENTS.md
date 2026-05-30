# AGENTS.md

## Overview

Docker dev environment on `node:24-bookworm`: neovim, tmux, lazygit, TypeScript, Oh My Zsh, Crush, Glow, Tailscale SSH. Published to `ghcr.io` for `linux/amd64`+`linux/arm64`. No tests or linting.

**Branch tags**: `main` -> `latest` + `YYYY.MM.DD` | non-main branches -> `{branch-name}` + `{branch-name}-YYYY.MM.DD`

## Commands

| Action | Command |
|--------|---------|
| Build | `docker build -t telescreen .` |
| Run | `docker run -it --rm telescreen` |
| Persistent home | `docker run -it --rm -v dev-env-home:/root telescreen` |
| Timezone | `-e TZ=America/New_York` |
| Tailscale SSH | `--cap-add=NET_ADMIN --device /dev/net/tun -v tailscale-state:/var/lib/tailscale -e TS_AUTHKEY=tskey-auth-xxx -e TS_HOSTNAME=my-dev-env` |
| Crush | `-e ZAI_API_KEY=your-key` |
| Multi-arch | `docker buildx build --platform linux/amd64,linux/arm64 -t telescreen .` |

No test suite, no linter. Verify changes with `docker build`.

## Setup (one-time, host only)

| Step | Command |
|------|---------|
| Verify skill loaded | `crush skill list` should show `check-versions` |

## Architecture

```
Dockerfile
  ├─ entrypoint.sh          → Runtime orchestrator (runs as root)
  │    ├─ sets TZ
  │    ├─ bootstraps .zshrc → copies /etc/zsh/zshrc
  │    ├─ symlinks tmux.conf → /etc/tmux/tmux.conf
  │    ├─ copies plugins    → /opt/tmux-plugins/ → ~/.tmux/plugins/
  │    ├─ copies skills     → /etc/agents/skills/
  │    ├─ fetches nvim config from Gist (fallback /etc/nvim/init.lua)
  │    ├─ starts tailscaled if TS_AUTHKEY set
  │    ├─ appends aliases (idempotent)
  │    └─ exec "$@" (zsh)
  │
  ├─ crush/
  │    ├─ crush.json         → /etc/crush/crush.json (zai provider, $ZAI_API_KEY, LSPs)
  │    └─ AGENTS.md          → /etc/crush/AGENTS.md (global prefs loaded via context_paths)
  ├─ init.zsh               → Shell env (EDITOR, aliases, tat fn, MOTD on login)
  ├─ zshrc                  → Custom .zshrc template (Oh My Zsh + sources init.zsh)
  ├─ tmux/
  │    ├─ tmux.conf         → /etc/tmux/tmux.conf (mouse, vi copy, yank, popup, renumber)
  │    ├─ popup.sh          → Scratch popup (prefix+s)
  │    ├─ session-status.sh → Status-right: * before hostname if scratch exists
  │    └─ renumber-sess.sh  → Renumber numeric sessions
  ├─ skills/                → Container skills (copied into image at /etc/agents/skills/)
  ├─ .agents/skills/        → Repo skills (auto-discovered by Crush and other tools)
  └─ .github/workflows/publish.yml → Multi-arch GHCR publish
```

Configs live in `/etc/` so they survive volume mounts on `/root`.

## Preferences

Global git conventions live in `crush/AGENTS.md` (loaded via `context_paths` in `crush.json`). Repo-specific preferences:

- Keep AGENTS.md in sync with the project structure.
- When adding/updating skills, review frontmatter: set `user-invocable: true` on skills designed for manual invocation (trigger phrases, argument hints). Omit on auto-triggered knowledge-only skills.

## Gotchas

- `tailscaled` auto-detects `/dev/net/tun` — uses tun mode when available, falls back to userspace networking
- Tailscale uses `--netfilter-mode=off` in tun mode (container kernels often lack nftables support)
- No `.dockerignore` - full build context sent on every build.
- Same-day pushes overwrite date tag.
- Neovim Gist URL hardcoded in `entrypoint.sh`.
- Tailscale SSH needs ACL policy in admin console.
- tmux-yank OSC 52 only - no clipboard support in some terminals.
- tmux plugins pre-installed at build time (TPM + tmux-yank), linked on first start.
- Scratch sessions (`scratch-*`) are persistent - they survive popup close, not killed automatically.
