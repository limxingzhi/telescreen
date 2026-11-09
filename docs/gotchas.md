# Gotchas

Things that cost time once and will cost it again.

## Networking and Tailscale

- `tailscaled` auto-detects `/dev/net/tun`: tun mode when available, userspace
  networking otherwise.
- In tun mode it runs with `--netfilter-mode=off`, because container kernels
  often lack nftables support.
- Tailscale SSH needs an ACL policy in the admin console; without it the daemon
  is up but connections are refused.
- State lives in the `tailscale-state` volume. Omit `TS_AUTHKEY` after the first
  run when that volume persists.

## Terminal and tmux

- `LANG=C.UTF-8` is set in the image. Without it tmux turns multibyte handling
  off (`client_utf8=0`) and Nerd Font icons break inside tmux while still
  rendering outside it.
- tmux-yank is OSC 52 only. There is no xclip/xsel in the image, so
  `@override_copy_command` copies into the tmux buffer and relies on
  `set-clipboard`. Terminals without OSC 52 support get nothing.
- tmux plugins are pre-installed at build time (TPM + tmux-yank) and linked on
  first start.
- tmux drops escape sequences it does not recognize (OSC 9 among them). Anything
  written into a pane or sent with `send-keys` never reaches the terminal
  unless `allow-passthrough on` is set and the sequence is wrapped in
  DCS passthrough. `display-message` banners are also unreliable for this: they
  render in some setups and silently vanish in others.
- Scratch sessions (`scratch-*`) are persistent: closing the popup does not kill
  them.

## Build

- No `.dockerignore`: the full build context (including `screenshots/`) is sent
  on every build. The workflow also builds with `no-cache: true`, so every push
  re-runs every layer.
- Same-day pushes overwrite the `YYYY.MM.DD` tag.
- `STARSHIP_VERSION` is pinned in the `Dockerfile`; starship ships static musl
  tarballs, so both architectures install the same way.
- The Neovim Gist URL is hardcoded in `entrypoint.sh`.
- `releases/download/...` URLs intermittently answer `504` from GitHub's CDN
  and are rate-limited anonymously. Builds do not authenticate to GitHub, so
  every download uses `--retry 5 --retry-all-errors` (Neovim also sets
  `--retry-delay 5`) to ride out transient failures.

## Crush notifications

Details in [long-turn-notifications.md](long-turn-notifications.md).

- The hook measures a turn from `TurnStart` to `TurnEnd`: permission prompts
  count, time waiting on the user does not.
- Abandoned-turn detection samples `/proc`, so the hook assumes Linux (the image
  is).
- `TurnEnd` does not fire when the provider errors; only `StopFailure` does. The
  stale start record is cleaned up by the next run.
- OSC 9 is a desktop notification in Ghostty, kitty and WezTerm; Terminal.app
  and iTerm2 ignore it.
- Terminals that do not decode OSC 9 do not swallow it either: the xterm
  sequence parser prints the body (`Crush finished (2m51s): <message>`) as
  plain text in the pane and only repaints over it at the next prompt, which
  looks like the notification took over the session. That is why the hook gates
  on `TERM` (`supportsOsc9`) instead of firing everywhere and hoping.
- The `options.notifications` value in `crush.json` is Crush's own and has no
  effect on this hook; the hook never reads it. Mute with
  `touch ~/.local/state/crush-notify/disabled` or `CRUSH_NOTIFY_NO_DRAIN=1`, or
  read what was skipped in `~/.local/state/crush-notify/hook.log`.
