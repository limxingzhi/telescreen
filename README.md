# 📺 telescreen

A cute, opinionated dev environment in a container. One `docker run` and you get a fully-loaded workspace with all your favorite CLI tools.

<p align="center">
  <img src="screenshots/screenshot1 - running crush in tmux.jpg" alt="Running Crush in tmux" />
</p>

> Crush running inside tmux - just run `crush` and start chatting.

<p align="center">
  <img src="screenshots/screenshot2 - running nvim in a scratch session.jpg" alt="Neovim in a scratch popup session" />
</p>

> Neovim in a scratch popup session - `prefix+s` opens a scratch workspace on demand.

<p align="center">
  <img src="screenshots/screenshot3 - running crush and lazygit in panes.jpg" alt="Crush and lazygit side by side" />
</p>

> Crush and lazygit in split panes - `prefix+%` to split vertically, then run `lazygit` in the new pane.

## What's inside

| Tool | Why you'll love it |
|------|--------------------|
| **[Crush](https://github.com/charmbracelet/crush)** | An adorable AI coding assistant that lives in your terminal. Ask it to build, refactor, debug - it just does it. |
| **Oh My Zsh** | Pretty prompts, sensible defaults, and a warm fuzzy feeling every time you open a shell. |
| **Tailscale SSH** | Connect from anywhere on your tailnet with `ssh root@my-dev-env`. No SSH keys to manage, no ports to expose, no networking headaches. |
| **Neovim** | The latest release. Auto-fetches a config from a Gist on first start, or mount your own. |
| **tmux** | Persistent sessions with mouse support, vi copy mode, yank-to-clipboard, and a scratch popup. |
| **lazygit** | Git but make it fun. Staging, committing, rebasing, diffing - all from a gorgeous TUI. |
| **Node.js 24 + TypeScript** | `tsc`, `ts-node`, `tsx`, `eslint`, `http-server` and more. |
| **Deno** | Because why not have a second runtime? |
| **LSP support** | Crush ships with language servers for TypeScript, Deno, and Bash. |
| **[Glow](https://github.com/charmbracelet/glow)** | Read markdown files right in your terminal, beautifully rendered. `glow README.md` and swoon. |
| **ripgrep, fd, fzf, jq** | The holy quaternity of "wait, that was fast." |
| **git** | Obviously. |

## Quick start

```sh
# Build
docker build -t dev-env .

# Run (persists your home directory across restarts)
docker run -it --rm -v dev-env-home:/root dev-env
```

That's it. You're in a zsh shell with everything ready to go.

## Git credentials (optional)

To `git push`/`pull` private repos, mount your SSH key and git config into the container:

```sh
docker run -it --rm \
  -v dev-env-home:/root \
  -v ~/.ssh:/root/.ssh:ro \
  -v ~/.gitconfig:/root/.gitconfig:ro \
  dev-env
```

- **`~/.ssh`** - your SSH key for authenticating with GitHub, GitLab, etc. Mounted read-only so the container can't modify it.
- **`~/.gitconfig`** - your name, email, and any git preferences. Without this, commits will use default/generic values.

Both are optional - the container works fine without them for local-only work.

## SSH from anywhere with Tailscale

No need to manage SSH keys, open ports, or worry about connectivity. Tailscale gives your container a stable identity on your private network and handles auth + encryption automatically.

```sh
docker run -it --rm \
  -v dev-env-home:/root \
  -v tailscale-state:/var/lib/tailscale \
  -e TS_AUTHKEY=tskey-auth-xxxxx \
  -e TS_HOSTNAME=my-dev-env \
  dev-env
```

Then from any device on your tailnet:

```sh
ssh root@my-dev-env
```

State is persisted in the `tailscale-state` volume - omit `TS_AUTHKEY` on subsequent runs.

## Using Crush

Crush uses [Z.AI](https://z.ai) directly (no gateway). Pass your API key at runtime:

```sh
docker run -it --rm -v dev-env-home:/root -e ZAI_API_KEY=your-key dev-env
```

Then just run `crush` and start chatting.

## Neovim config

On first start, the container fetches a config from a [GitHub Gist](https://gist.github.com/limxingzhi/fa3be5045caded9d4e09f2423dbfcec7). If the fetch fails, it falls back to a minimal default. Mount your own to override:

```sh
docker run -it --rm -v ./my-init.lua:/root/.config/nvim/init.lua dev-env
```

## tmux

### Keybindings

| Shortcut | Action |
|----------|--------|
| `prefix + s` | Open a scratch popup session (toggle) |
| `prefix + h/j/k/l` | Navigate between panes (vi-style) |
| `prefix + [` | Enter vi copy mode (`v` to select, `y` to yank to clipboard) |
| `prefix + =` | Evenly split panes horizontally |
| `prefix + %` | Split pane vertically |
| `prefix + "` | Split pane horizontally |

### Scratch sessions

`prefix + s` opens a scratch tmux session in a popup - a throwaway workspace for quick experiments, running tests, editing notes, etc. The scratch is tied to your current session (e.g. session `main` gets `scratch-main`), so it persists across popup toggles. A `*` appears in the status bar (before the hostname) when a scratch session exists.

### Session management with `tat`

The `tat <name>` function switches to a tmux session by name - creating it if it doesn't exist:

- Outside tmux: attaches or creates the session
- Inside tmux: switches clients or creates + switches

Sessions with numeric names are auto-renumbered when created, closed, or renamed.

## Workflows

### Vibe coding with AI review

The core loop: Crush builds the code, lazygit reviews the changes, nvim steps in for manual edits - all inside tmux.

1. Clone a repo and open it in a tmux session: `tat my-project`
2. Run `crush` and describe what you want built
3. Split a pane (`prefix + %`) and run `lazygit` to review diffs, stage, and commit
4. Open `nvim` when you need to hand-edit something, or use the scratch popup (`prefix + s`) for quick notes

### Disposable package maintenance

No local copies of repos on your machine. Clone into the container, do the work, push, destroy the container.

```sh
docker run -it --rm \
  -v dev-env-home:/root \
  -v ~/.ssh:/root/.ssh:ro \
  -v ~/.gitconfig:/root/.gitconfig:ro \
  ghcr.io/limxingzhi/telescreen:latest
```

Clone the package, bump versions, publish, then `docker rm` and it's like you were never there. Home volume persists your shell history and tool configs - not the repos.

### LeetCode practice

Split a pane: nvim on the left for writing solutions, `npx tsx solution.ts` on the right to run them.

```
prefix + %    ← split vertically
nvim          ← left pane
npx tsx foo   ← right pane
```

## docker-compose

```yaml
services:
  workspace:
    image: ghcr.io/limxingzhi/telescreen:latest
    container_name: workspace
    volumes:
      - dev-home:/root
      - ~/.ssh:/root/.ssh:ro
      - ~/.gitconfig:/root/.gitconfig:ro
      - tailscale-state:/var/lib/tailscale
    environment:
      - TS_AUTHKEY=tskey-auth-keygoeshere
      - TS_HOSTNAME=my-dev-env
      - ZAI_API_KEY=your-zai-api-key
    network_mode: host

volumes:
  dev-home:
  tailscale-state:
```

## Handy aliases

Built into every shell:

| Alias | Command |
|-------|---------|
| `n` | `npm` |
| `nr` | `npm run` |
| `tat <name>` | Switch to or create a tmux session by name |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TS_AUTHKEY` | Tailscale auth key. Required on first run; optional after that if state is persisted. |
| `TS_HOSTNAME` | Hostname for the Tailscale node (e.g. `my-dev-env` → SSH via `ssh root@my-dev-env`) |
| `ZAI_API_KEY` | Z.AI API key for Crush. Required for AI features. Get one at [z.ai](https://z.ai). |

## Multi-architecture

Images are built for **linux/amd64** and **linux/arm64** and published to GHCR on every push to `main`.

## Notes

- Designed to be disposable - safe to rebuild anytime
- Two volumes: `/root` (workspace + configs), `/var/lib/tailscale` (Tailscale state)
- Tailscale uses **userspace networking** - no `--cap-add` or special permissions needed
- Tailscale SSH requires an [ACL policy](https://login.tailscale.com/admin/acls) allowing SSH access
- Image tags: `latest` + date-based (`YYYY.MM.DD`)
- tmux plugins (TPM + tmux-yank) are pre-installed at build time and linked on first start

---

> *The telescreen received and transmitted simultaneously. Any sound that Winston made, above the level of a very low whisper, would be picked up by it; moreover, so long as he remained within the field of vision which the metal plaque commanded, he could be seen as well as heard. There was of course no way of knowing whether you were being watched at any given moment.*
>
> — George Orwell, *1984*

Might as well have good tools.
