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
