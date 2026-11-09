# AGENTS.md

Docker dev environment on `node:26-bookworm`: neovim, tmux, lazygit, TypeScript,
starship, Crush, Glow, htop, Tailscale SSH. Published to `ghcr.io` for
`linux/amd64` + `linux/arm64`.

Details live in `docs/`; this file is only the index plus the rules that must
load with every task.

## Docs

| Doc | Covers |
|-----|--------|
| [docs/architecture.md](docs/architecture.md) | Layout, the `/etc` vs `/root` split, entrypoint behavior, runtime hooks, image publishing and tags |
| [docs/toolchain.md](docs/toolchain.md) | What ships in the image, build/run/Tailscale commands, testing, script language rules |
| [docs/gotchas.md](docs/gotchas.md) | Networking, tmux/terminal, build, and notification pitfalls |
| [docs/long-turn-notifications.md](docs/long-turn-notifications.md) | How the Crush turn clock, pid check, and OSC 9 delivery work |

Update the matching doc when behavior changes, and keep this index in sync.

## Quick commands

| Action | Command |
|--------|---------|
| Build | `docker build -t telescreen .` |
| Run | `docker run -it --rm telescreen` |
| Persistent home | `docker run -it --rm -v dev-env-home:/root telescreen` |
| Hook tests | `node --test scripts/test-crush-notify.js` |

No linter. Verify changes with `docker build`.

## Rules

- Read the relevant doc in `docs/` before changing a subsystem; keep it updated
  in the same change.
- Global git conventions live in `crush/AGENTS.md` (loaded via `context_paths`
  in `crush.json`); this file does not repeat them.
- When adding or updating skills, review frontmatter: set
  `user-invocable: true` on skills meant for manual invocation (trigger
  phrases, argument hints), omit it on auto-triggered knowledge-only skills.
- Skills that write a standalone markdown artifact (e.g. handoff docs) must
  prefix the filename with the date: `YYYY-MM-DD-<slug>.md` (e.g.
  `1997-11-21-<slug>.md`). Workspace state files updated in place (e.g. a
  skill's `MISSION.md`, learning records) keep their fixed names.
- Prefer JavaScript for new scripts; see
  [docs/toolchain.md](docs/toolchain.md#language-rules) for the exact split
  between JS, shell, and the ban on Python.
