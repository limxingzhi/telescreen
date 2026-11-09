# Handoff: notify over Ghostty when a long Crush turn ends

**Status: done, uncommitted.** The guard bug is fixed, the JS port is complete,
the Python files are gone, and `node --test scripts/test-crush-notify.js` passes
(21 tests). Nothing is committed yet. Remaining work is verification on the Mac
(see "Open questions").

### Resolution of the guard bug

The comparison mixed units: `elapsed` is milliseconds (from `measure()`), but
`threshold` is seconds (30), so `elapsed < 30` was always false and every turn
notified. The last attempted rewrite, `if (!(Number(elapsed) < threshold))`,
merely inverted it and silenced everything including the 95s turn. The fix is
`if (Number(elapsed) < threshold * 1000) return "";` in `handle()`. When
rewriting, keep the boundary pinned: 29900ms silent, 30000ms notifies.

## Goal

When a Crush turn runs 30 seconds or more, fire a desktop notification in the
Ghostty terminal on the Mac. Crush runs in tmux in a VPS over Tailscale SSH, so
the notification must survive tmux and the SSH hop, even when the user is
looking at a different tmux session or another app.

## Hooks available (what the exploration found)

Crush v0.100.0 has 13 events (`TurnStart`, `TurnEnd`, `StopFailure`,
`Interrupt`, `SessionStart`, `SessionEnd`, `PreToolUse`, `PostToolUse`,
`PostToolUseFailure`, `PermissionRequest`, `PermissionResult`, `PreCompact`,
`PostCompact`). Only tool events can block or rewrite; the rest observe.
Reference: https://github.com/charmbracelet/crush/blob/main/docs/hooks/README.md
and the `crush-hooks` skill.

Relevant here:

| Event | Use |
|-------|-----|
| `TurnStart` | stamp the start time for the session |
| `TurnEnd` | measure, notify when >= 30s |
| `StopFailure` | notifies on provider errors (not wired; useful, see below) |
| `Interrupt` | user pressed ctrl-c (not wired) |
| `SessionEnd` | 2s budget only, wrong granularity |

Confirmed by experiment on the VPS:

- Global `/etc/crush/crush.json` hooks load and merge with project hooks
  (project wins). A hook configured only globally fired in a fresh `crush run`
  from an unrelated directory.
- A `.crushrc` dropped into an already-initialized project is **not** loaded.
  Configure hooks in `crush.json`, not `crushrc`.
- The payload has `session_id` but no tmux session name. Check whether
  `TMUX_SESSION` reaches hooks; if it does not, the tmux path resolves the
  session from `session_id`, then falls back to the first `crush*` session.
- `TurnEnd` does not fire when the provider errors (`StopFailure` does). The
  deepseek key is out of balance and zai rejects the key, so full-turn manual
  tests ended in `StopFailure`.

## How notifications travel

Crush's own `options.notifications` only rings the bell; tmux intercepts it, and
tmux's notification string cannot be set by hand. So the hook ships OSC 9
(`ESC ] 9 ; text BEL`, https://ghostty.org/docs/vt/osc/9) three ways:

1. **stdout of the `TurnEnd` hook** - Crush writes hook stdout to the terminal.
2. **Spool + prompt drain** - hook writes the bytes to
   `~/.local/state/crush-notify/spool/`; `drain.js` runs as a zsh `precmd` hook
   and replays them at the next prompt. This is the only reliable way to reach
   the pane the user is actually looking at.
3. **tmux pane tty** - `tmux run-shell -b` runs `send-keys -H` (hex bytes, so
   the escape is injected rather than typed) plus `display-message`. Verified
   with `pipe-pane`: the raw bytes reach the pane's tty.

## Files

| File | State |
|------|-------|
| `crush/notify/turn-notify.js` | The hook, executable, `#!/usr/bin/env node`. Fixed and tested. |
| `crush/notify/drain.js` | Spool replayer, executable. Tested for tty, pipe, and missing spool. |
| `scripts/test-crush-notify.js` | `node --test` suite, 21 tests, all passing. |
| `crush/crush.json` | `hooks.TurnStart` + `hooks.TurnEnd` -> `/etc/crush/notify/turn-notify.js`, timeout 5. |
| `zshrc` | `precmd` hook calling `drain.js`. |
| `entrypoint.sh` | Appends the drain block to older `~/.zshrc` copies, keyed on `precmd_crush_notify` (matches the `.js` line, so no rewrite on restart). |
| `Dockerfile` | `RUN chmod +x /etc/crush/notify/*.js`. |
| `README.md`, `AGENTS.md` | Updated to the `.js` names and the `node --test` command. |

The Python files and their test suite are deleted.

## Verification

No Docker and no healthy provider key are available on this host. The suite
runs without either:

```sh
node --test scripts/test-crush-notify.js
```

It covers the 29.9s/30s boundary, OSC 9 formatting, control-char stripping,
the kill switch, tmux targeting, spool cap, orphaned-turn collapse, and the
drain (tty, pipe, missing spool). The hook was also run end to end over stdin
and `drain.js` replayed through a real pty, both producing the expected
`ESC ] 9 ; ... BEL` bytes.

## Open questions (decide before pushing)

- **Ghostty notification attribution.** `send-keys -H` writes through the pane's
  client; if several tmux sessions share one Ghostty window, the notification
  may land on the wrong surface. Not tested on the Mac.
- **Injected bytes in a shell pane.** If the fallback picks a pane running zsh,
  OSC bytes print at the prompt. Consider checking `#{pane_current_command}`.
- **Hook path on macOS.** `/etc/crush/notify/...` exists only on the VPS.
- **Ghostty-native fallback.** `notify-on-command-finish = always|unfocused` in
  the Mac's Ghostty config notifies on every command, not just long turns.

## Suggested skills

- `crush-hooks` - authoritative hook contract before changing config or output.
- `diagnose` - for the guard bug; reproduce, minimise, instrument in that order.
- `tdd` - when rewriting the hook, pin the 29/30s boundary first.
- `handoff` - when this is picked up again.
