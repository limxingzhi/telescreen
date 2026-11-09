# Architecture

The image is a Debian dev box (`node:26-bookworm`) built from a single
`Dockerfile`. Everything you can configure lives under `/etc/`, so a volume
mounted on `/root` cannot shadow it. `entrypoint.sh` runs as root on every start
and wires those files into the persistent home before handing off to zsh.

```
Dockerfile
  ├─ entrypoint.sh          → Runtime orchestrator (runs as root)
  │    ├─ sets TZ
  │    ├─ bootstraps .zshrc → copies /etc/zsh/zshrc (migrates pre-starship copies)
  │    ├─ symlinks tmux.conf → /etc/tmux/tmux.conf
  │    ├─ symlinks lazygit config → /etc/lazygit/config.yml (replaces empty/stale file)
  │    ├─ copies plugins    → /opt/tmux-plugins/ → ~/.tmux/plugins/
  │    ├─ copies skills     → /etc/agents/skills/
  │    ├─ fetches nvim config from Gist (fallback /etc/nvim/init.lua)
  │    ├─ starts tailscaled if TS_AUTHKEY set
  │    ├─ appends aliases (idempotent)
  │    ├─ sources ~/start.sh if present (runtime init hook)
  │    └─ exec "$@" (zsh)
  │
  ├─ crush/
  │    ├─ crush.json         → /etc/crush/crush.json (provider, $ZAI_API_KEY, LSPs,
  │    │                       TurnStart/TurnEnd notification hooks)
  │    ├─ AGENTS.md          → /etc/crush/AGENTS.md (global prefs loaded via context_paths)
  │    └─ notify/            → /etc/crush/notify/ (turn-notify.js, drain.js)
  ├─ lazygit/
  │    └─ config.yml         → /etc/lazygit/config.yml (gruvbox-material theme)
  ├─ init.zsh               → Shell env (EDITOR, aliases, tat/trun fns, MOTD on login)
  ├─ zshrc                  → Custom .zshrc template (starship prompt + sources init.zsh)
  ├─ starship.toml          → /etc/starship/starship.toml (prompt config, $STARSHIP_CONFIG)
  ├─ nvim/plugin/clipboard.lua → OSC 52 clipboard provider (copied to ~/.config/nvim/plugin/)
  ├─ tmux/
  │    ├─ tmux.conf         → /etc/tmux/tmux.conf (mouse, vi copy, yank, popup, renumber)
  │    ├─ popup.sh          → Scratch popup (prefix+s)
  │    ├─ session-status.sh → Status-right: * before hostname if scratch exists
  │    └─ renumber-sess.sh  → Renumber numeric sessions
  ├─ skills/                → Container skills (copied into image at /etc/agents/skills/)
  ├─ .agents/skills/        → Repo skills (auto-discovered by Crush and other tools)
  ├─ docs/                  → Design notes (not copied into the image)
  └─ .github/workflows/publish.yml → Multi-arch GHCR publish
```

## The `/etc` rule

Files baked into the image sit in `/etc/...`; files the user owns sit in
`/root`. That split is what makes `-v dev-env-home:/root` work: the container
still finds its configs with an empty or foreign home.

| Concern | Where it lives | How it reaches the user |
|---------|----------------|-------------------------|
| Shell startup | `/etc/zsh/zshrc` | copied to `~/.zshrc` only when missing |
| Shell env and aliases | `/etc/zsh/init.zsh` | sourced by `~/.zshrc` |
| tmux | `/etc/tmux/tmux.conf` | symlinked every start |
| lazygit | `/etc/lazygit/config.yml` | symlinked, replacing empty/stale files |
| Crush | `/etc/crush/crush.json` | `CRUSH_GLOBAL_CONFIG` env var |
| Crush global prefs | `/etc/crush/AGENTS.md` | `context_paths` in `crush.json` |
| tmux plugins | `/opt/tmux-plugins/` | copied to `~/.tmux/plugins/` |

## Runtime customization

Two escape hatches need no rebuild:

- `~/start.sh` is sourced as bash by the entrypoint on every start. Put
  environment setup here (`export CRUSH_NOTIFY_THRESHOLD=60`, extra aliases,
  tool installs).
- `~/.zshrc` can be edited directly. The baked template is only copied when the
  file is missing, so edits persist across containers on a volume, and
  `entrypoint.sh` only appends to it when a known-older copy is detected.

## Publishing

`.github/workflows/publish.yml` builds `linux/amd64` + `linux/arm64` with
buildx and pushes to `ghcr.io` on every push to `main` or `dev` (and on manual
dispatch), with `no-cache: true`.

| Branch | Tags |
|--------|------|
| `main` | `latest`, `YYYY.MM.DD` |
| any other | `{branch}`, `{branch}-YYYY.MM.DD` |

A second push on the same day overwrites that day's date tag.
