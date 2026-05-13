# AGENTS.md

## Project Overview

A Docker-based development environment image built on `node:24-bookworm`. It provisions a ready-to-use workspace with neovim, tmux, lazygit, TypeScript tooling, Oh My Zsh, Crush (AI coding assistant), Glow, and Tailscale (with SSH), then bootstraps tmux config, shell aliases, and a remote neovim config on container startup.

The image is published to `ghcr.io` on every push to `main` for both `linux/amd64` and `linux/arm64`.

## Commands

| Action | Command |
|--------|---------|
| Build image locally | `docker build -t dockerized-env .` |
| Run container | `docker run -it --rm dockerized-env` |
| Run with workspace mount | `docker run -it --rm -v dev-env-home:/root dockerized-env` |
| Run with Tailscale SSH | `docker run -it --rm -v dev-env-home:/root -v tailscale-state:/var/lib/tailscale -e TS_AUTHKEY=tskey-auth-xxxxx -e TS_HOSTNAME=my-dev-env dockerized-env` |
| Multi-platform build (needs buildx + QEMU) | `docker buildx build --platform linux/amd64,linux/arm64 -t dockerized-env .` |

There is no test suite, linting, or CI beyond the publish workflow.

## Architecture

```
Dockerfile                        → Defines the image (base image, Tailscale, apt packages, Crush, Glow, Oh My Zsh, TypeScript, Deno, tmux plugins, env vars, entrypoint)
entrypoint.sh                     → Runs on every container start (starts Tailscale, links tmux config, copies tmux plugins, fetches neovim config, writes shell aliases)
tmux/tmux.conf                    → tmux config with mouse, vi copy mode, tmux-yank, popup, session renumber hooks
tmux/popup.sh                     → Opens a scratch tmux session in a popup (bound to prefix+s)
tmux/renumber-sess.sh             → Renumbers numeric tmux sessions sequentially
zsh/aliases.zsh                   → Shell aliases (n, nr, tat)
skills/                           → Crush agent skills (copied to /etc/agents/skills/)
.github/workflows/publish.yml     → Builds and pushes multi-arch image to GHCR on push to main
```

**Startup flow:**
1. `entrypoint.sh` runs as entrypoint (container runs as root)
2. Bootstraps `.zshrc` from Oh My Zsh template if missing
3. Symlinks `~/.tmux.conf` → `/etc/tmux/tmux.conf` if not present
4. Copies TPM + tmux-yank to `~/.tmux/plugins/` if not present (pre-installed at build time in `/opt/tmux-plugins/`)
5. Copies Crush agent skills to `~/.config/agents/skills/`
6. Fetches neovim `init.lua` from a GitHub Gist (falls back to `/etc/nvim/init.lua`)
7. If `TS_AUTHKEY` is set, starts `tailscaled` in background, then runs `tailscale up --authkey=... --ssh`. If existing state is found in `/var/lib/tailscale`, it reuses it without re-authenticating.
8. Appends shell aliases source to `/root/.zshrc` (idempotent via `grep -qxF`)
9. `exec "$@"` to hand off to the default `CMD` (`zsh`)

## Key Details

- **Base image**: `node:24-bookworm` — plain Node.js 24 on Debian Bookworm. zsh, git, and Oh My Zsh are installed manually in the Dockerfile.
- **No `USER` directive**: The entire container runs as root. The neovim config dir is `/root/.config/nvim`.
- **Tailscale is installed from the official Debian repo**: Uses the `bookworm` suite apt repo from `pkgs.tailscale.com`. Installed at build time, started at runtime only if `TS_AUTHKEY` is provided.
- **Tailscale state persistence**: Tailscale state lives in `/var/lib/tailscale` (separate volume). Mount a named volume there to persist state across restarts — no need to provide `TS_AUTHKEY` on subsequent runs.
- **Tailscale SSH**: Enabled via `--ssh` flag on `tailscale up`. No OpenSSH server needed — Tailscale intercepts SSH connections directly. Authentication is handled by Tailscale's ACLs, not host keys.
- **Userspace networking**: `tailscaled` runs with `--tun=userspace-networking`, which doesn't require `/dev/net/tun`, kernel modules, or special Docker capabilities (`--cap-add`). This makes it work in any Docker environment.
- **Home as workspace**: `WORKDIR` is `/root`. Projects, configs, and all tooling state live in the home directory. Mount a volume at `/root` to persist everything.
- **Neovim config is fetched at runtime**: On first start, the entrypoint fetches the config from a GitHub Gist. If the fetch fails, it falls back to a minimal `init.lua` at `/etc/nvim/init.lua`. The Dockerfile creates this fallback at build time (no `COPY` of an `init.lua` file needed).
- **tmux config**: Stored at `/etc/tmux/tmux.conf` (survives volume mounts on `/root`). Symlinked to `~/.tmux.conf` on first start. Includes mouse support, vi copy mode, and session renumber hooks.
- **tmux plugins (TPM + tmux-yank)**: Cloned at build time to `/opt/tmux-plugins/`. Copied to `~/.tmux/plugins/` on first start. tmux-yank uses OSC 52 clipboard forwarding (`set-clipboard on`) so yanks work over SSH without `xsel`.
- **tmux popup**: `prefix + s` runs `/etc/tmux/popup.sh` which opens a scratch session in a popup.
- **tmux session renumbering**: Hooks on `session-created`, `session-closed`, and `session-renamed` run `/etc/tmux/renumber-sess.sh` to renumber numeric sessions sequentially.
- **Idempotent zshrc modifications**: The script uses `grep -qxF` to check before appending, so repeated starts don't duplicate aliases.
- **`tat` function**: Switches to or creates a tmux session by name. Behaves differently depending on whether already inside tmux.
- **CI uses lowercase repo name**: The publish workflow lowercases `github.repository` to ensure valid GHCR image names.
- **CI caching**: Uses `cache-from: type=gha` and `cache-to: type=gha,mode=max` for BuildKit cache via GitHub Actions.
- **Crush (AI coding assistant)**: Installed from GitHub releases as a `.deb` package.
- **Glow**: Installed from GitHub releases as a `.deb` package. Markdown renderer for the terminal.

## Preferences

- When asked to commit, only commit — never push to remote unless asked.
- When making changes to the project, always update AGENTS.md to keep it in sync.

## Gotchas

- **`tailscaled` runs as a background process** — it's started with `&` in the entrypoint, not as a supervised service. If it crashes, Tailscale SSH will stop working. The container itself keeps running.
- **Daemon startup waits for socket** — the entrypoint polls for `/var/run/tailscale/tailscaled.sock` for up to 15 seconds instead of a blind `sleep`.
- No `.dockerignore` exists — the entire repo context is sent to the Docker daemon on build.
- The image tag in CI is date-based (`YYYY.MM.DD`), not semver. Pushing to `main` on the same day overwrites the tag.
- The neovim config Gist URL is hardcoded in `entrypoint.sh`.
- Tailscale SSH requires an ACL policy in your Tailscale admin console that allows SSH access to the node. Without it, connections will be rejected even if the container is running.
- **tmux-yank without `xsel`** — yanks go to tmux's internal buffer + OSC 52 (works with most modern terminals over SSH). Won't work with terminals that don't support OSC 52 (e.g. minimal terminals, some older PuTTY builds).
