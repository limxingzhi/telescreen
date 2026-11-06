# Handoff: Replace Oh My Zsh with starship

**Status: DONE** (commit `0fd8035` on `dev`). Kept as a record of what changed,
why, and how it was verified.

## Goal

Swap Oh My Zsh for [starship](https://starship.rs) in the telescreen image. A
hand-written `.zshrc` with light config replaces the framework. Motivation: Oh
My Zsh pulled the whole framework into the image and slowed shell startup;
starship is a single static binary with near-zero config.

## What changed

| File | Change |
|------|--------|
| `Dockerfile` | Added `ARG STARSHIP_VERSION=v1.27.0`. Oh My Zsh `ENV ZSH` + `install.sh` block replaced by a musl tarball install (`x86_64-unknown-linux-musl` / `aarch64-unknown-linux-musl`, selected from `uname -m`), `install starship /usr/local/bin`. `chsh -s /usr/bin/zsh root` kept. Added `COPY starship.toml /etc/starship/starship.toml` + `ENV STARSHIP_CONFIG=/etc/starship/starship.toml`. |
| `zshrc` | Rewritten as a plain zsh rc: `HISTFILE`/`HISTSIZE`/`SAVEHIST`, `setopt SHARE_HISTORY HIST_IGNORE_ALL_DUPS HIST_IGNORE_SPACE AUTO_CD EXTENDED_GLOB`, `eval "$(starship init zsh)"`, then `source /etc/zsh/init.zsh` last. |
| `starship.toml` | New. `add_newline = false`, `command_timeout = 1000`, `❯` prompt with red error symbol, `cmd_duration` after 2s, `hostname` on SSH only, `git_status` forced to bold red. |
| `entrypoint.sh` | `.zshrc` bootstrap now also migrates an old copy: if the file exists and still mentions `oh-my-zsh.sh`, it is backed up to `~/.zshrc.pre-starship` and replaced with the template. Hand-written `.zshrc` files are left alone. Idempotent (the replacement no longer matches). |
| `README.md` | "What's inside" row updated; runtime customization text documents the migration and that a `~/.config/starship.toml` is ignored while `$STARSHIP_CONFIG` is set. |
| `AGENTS.md` | Overview, architecture tree (`zshrc` + `starship.toml`, entrypoint migration), and a gotcha about the pinned version. |
| `.agents/skills/check-versions/` | `STARSHIP_VERSION` / `starship` added to `SKILL.md` and `check-versions.ts` so the pin can be refreshed. |

`init.zsh` was already framework-agnostic and is unchanged: aliases (`n`, `nr`),
`tat`/`trun` tmux helpers, `EDITOR`/`VISUAL=nvim`, login-only MOTD.

## Footguns found and fixed

- **Old volumes break every shell** - a persisted `.zshrc` sourcing
  `$ZSH/oh-my-zsh.sh` would error on start now that `/opt/oh-my-zsh` is gone.
  Fixed by the entrypoint migration (with a backup).
- **Prompt could hang** - starship shells out per prompt, so a slow `node`/git
  scan could stall. Capped every module with `command_timeout = 1000`.
- **Users editing `~/.config/starship.toml` silently ignored** - documented.
- **Prompt-parsing tools / invisible grid color** - `git_status` forced to
  `bold red`.

Left as-is (deliberate config, not bugs): `$STARSHIP_CONFIG` override, and
`AUTO_CD` as a behavior change.

## Verified

No docker or container runtime is available on the dev host, so `docker build`
was **not** run. Verified instead:

- `check-versions starship` reports `✓ STARSHIP_VERSION v1.27.0`.
- Both release tarball URLs return HTTP 200 for `v1.27.0`.
- The Dockerfile install steps replayed locally; resulting binary reports
  `starship 1.27.0`.
- `starship prompt` renders with the new `starship.toml` (including the error
  symbol at `--status=1`).
- `zsh -n zshrc` and `bash -n entrypoint.sh` pass.
- Migration tested against a real Oh My Zsh `.zshrc`: runs once, backs up the
  original, and is silent on the second start.

## Remaining for whoever picks this up

- Run `docker build -t telescreen .` then `docker run -it --rm telescreen` on a
  machine with a container runtime. Confirm: prompt renders, aliases (`n`, `nr`),
  `tat`/`trun`, MOTD on login, `EDITOR=nvim`, and a noticeably faster
  `time zsh -i -c exit`.
- Confirm the arm64 leg builds (`docker buildx build --platform linux/arm64`).
  The musl mapping is the only arch-specific piece.
