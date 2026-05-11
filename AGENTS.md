# AGENTS.md

## Project Overview

A Docker-based development environment image built on `node:24-bookworm`. It provisions a ready-to-use workspace with neovim, tmux, lazygit, TypeScript tooling, Oh My Zsh, Crush (AI coding assistant), and Tailscale (with SSH), then bootstraps shell aliases and a remote neovim config on container startup.

The image is published to `ghcr.io` on every push to `main` for both `linux/amd64` and `linux/arm64`.

## Commands

| Action | Command |
|--------|---------|
| Build image locally | `docker build -t dockerized-env .` |
| Run container | `docker run -it --rm dockerized-env` |
| Run with workspace mount | `docker run -it --rm -v dev-env-home:/root dockerized-env` |
| Run with Tailscale SSH | `docker run -it --rm -v dev-env-home:/root -v tailscale-state:/var/lib/tailscale -e TS_AUTHKEY=tskey-auth-xxxxx -e TS_HOSTNAME=my-dev-env dockerized-env` |
| Run with Crush + Tailscale SSH | `docker run -it --rm -v dev-env-home:/root -v tailscale-state:/var/lib/tailscale -e ZAI_API_KEY=your-key -e TS_AUTHKEY=tskey-auth-xxxxx -e TS_HOSTNAME=my-dev-env dockerized-env` |
| Multi-platform build (needs buildx + QEMU) | `docker buildx build --platform linux/amd64,linux/arm64 -t dockerized-env .` |

There is no test suite, linting, or CI beyond the publish workflow.

## Architecture

```
Dockerfile                        → Defines the image (base image, Tailscale, apt packages, Crush, Oh My Zsh, TypeScript, env vars, entrypoint)
entrypoint.sh                     → Runs on every container start (starts Tailscale, fetches neovim config, writes shell aliases)
crush/crush.json                  → Crush config with z.ai provider (API key via $ZAI_API_KEY env var)
init.lua                          → Default neovim config (bundled in image, overridden by remote fetch)
.github/workflows/publish.yml     → Builds and pushes multi-arch image to GHCR on push to main
```

**Startup flow:**
1. `entrypoint.sh` runs as entrypoint (container runs as root)
2. If `TS_AUTHKEY` is set, starts `tailscaled` in background, then runs `tailscale up --authkey=... --ssh`. If existing state is found in `/var/lib/tailscale`, it reuses it without re-authenticating. `TS_HOSTNAME` sets the node name.
3. Fetches a neovim `init.lua` from a GitHub Gist to `$HOME/.config/nvim/init.lua`
4. Appends shell aliases/functions (`n`, `nr`, `tat`) to `/root/.zshrc` (idempotent via `grep -qxF`)
5. `exec "$@"` to hand off to the default `CMD` (`zsh`)

## Key Details

- **Base image**: `node:24-bookworm` — plain Node.js 24 on Debian Bookworm. zsh, git, and Oh My Zsh are installed manually in the Dockerfile.
- **No `USER` directive**: The entire container runs as root. The neovim config dir is `/root/.config/nvim`.
- **Tailscale is installed from the official Debian repo**: Uses the `bookworm` suite apt repo from `pkgs.tailscale.com`. Installed at build time, started at runtime only if `TS_AUTHKEY` is provided.
- **Tailscale state persistence**: Tailscale state lives in `/var/lib/tailscale` (separate volume). Mount a named volume there to persist state across restarts — no need to provide `TS_AUTHKEY` on subsequent runs.
- **Tailscale SSH**: Enabled via `--ssh` flag on `tailscale up`. No OpenSSH server needed — Tailscale intercepts SSH connections directly. Authentication is handled by Tailscale's ACLs, not host keys.
- **Userspace networking**: `tailscaled` runs with `--tun=userspace-networking`, which doesn't require `/dev/net/tun`, kernel modules, or special Docker capabilities (`--cap-add`). This makes it work in any Docker environment.
- **Home as workspace**: `WORKDIR` is `/root`. Projects, configs, and all tooling state live in the home directory. Mount a volume at `/root` to persist everything.
- **Neovim config is remote-fetched on every start**: The config is pulled from a GitHub Gist at container startup. If the fetch fails, it falls back to the `init.lua` bundled in the image via `COPY`. Changes to the Gist take effect on next container launch without rebuilding.
- **Idempotent zshrc modifications**: The script uses `grep -qxF` to check before appending, so repeated starts don't duplicate aliases.
- **`tat` function**: Switches to or creates a tmux session by name. Behaves differently depending on whether already inside tmux.
- **CI uses lowercase repo name**: The publish workflow lowercases `github.repository` to ensure valid GHCR image names.
- **CI caching**: Uses `cache-from: type=gha` and `cache-to: type=gha,mode=max` for BuildKit cache via GitHub Actions.
- **Crush (AI coding assistant)**: Installed from GitHub releases as a `.deb` package. Config lives at `/etc/crush/crush.json` (survives bind mounts on `/root`). The `CRUSH_GLOBAL_CONFIG` env var points to it.
- **Crush API key**: The z.ai provider config uses `$ZAI_API_KEY` env var expansion. Pass `-e ZAI_API_KEY=your-key` at `docker run` to authenticate. Without it, Crush will fail to connect to the provider.

## Gotchas

- **`init.lua` is `COPY`ed but doesn't exist in the repo** — the `Dockerfile` line `COPY init.lua /root/.config/nvim/init.lua` will fail on `docker build` unless an `init.lua` file is present in the build context. This file needs to be created or the `COPY` line removed if relying solely on the remote fetch.
- **`tailscaled` runs as a background process** — it's started with `&` in the entrypoint, not as a supervised service. If it crashes, Tailscale SSH will stop working. The container itself keeps running.
- **Daemon startup waits for socket** — the entrypoint polls for `/var/run/tailscale/tailscaled.sock` for up to 15 seconds instead of a blind `sleep`.
- No `.dockerignore` exists — the entire repo context is sent to the Docker daemon on build.
- The image tag in CI is date-based (`YYYY.MM.DD`), not semver. Pushing to `main` on the same day overwrites the tag.
- The neovim config Gist URL is hardcoded in `entrypoint.sh`.
- Tailscale SSH requires an ACL policy in your Tailscale admin console that allows SSH access to the node. Without it, connections will be rejected even if the container is running.
