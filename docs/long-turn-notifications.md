# Long-turn notifications

When a Crush turn runs for 8 seconds or more, the container fires a desktop
notification in the Ghostty terminal on your Mac. Crush runs in tmux on a VPS
over Tailscale SSH, so the notification has to survive tmux and the SSH hop, and
still arrive when you are looking at a different pane or another app.

Source: `crush/notify/turn-notify.js` (the hook), `crush/notify/drain.js` (the
prompt replayer), configured in `crush/crush.json`.

## 1. Crush calls the hook twice per turn

Hooks are configured in `crush/crush.json` and land at `/etc/crush/crush.json` in
the image:

```json
"hooks": {
  "TurnStart": [{ "command": "/etc/crush/notify/turn-notify.js", "timeout": 5 }],
  "TurnEnd":   [{ "command": "/etc/crush/notify/turn-notify.js", "timeout": 5 }]
}
```

The same script serves both events. It receives a JSON payload on stdin with
`event`, `session_id`, and (on `TurnEnd`) `last_assistant_message`. `TurnStart`
fires when you send a message, `TurnEnd` when Crush stops and waits for you
again. Those are two separate processes inside one turn, so the hook does not
keep state in memory; it uses a small file on disk.

## 2. The turn clock

On `TurnStart`, `measure()` writes `{"pid": <crush pid>, "since": <ms>}` to
`~/.local/state/crush-notify/<session>.json` and returns 0. The session key is
`TMUX_SESSION` when present, otherwise the payload's `session_id`, so each Crush
session gets its own file.

## 3. Deciding whether 8 seconds passed

On `TurnEnd` it calls `measure()` again, which returns `now - since`, the
wall-clock elapsed time in milliseconds (`turn-notify.js:148-173`). The guard
then buys the comparison in matching units:

```js
const threshold = Number(settings.threshold) || 8;    // seconds
if (Number(elapsed) < threshold * 1000) return "";    // 8_000 ms
```

Wall-clock time means **permission prompts count**: if Crush waits 40 seconds for
you to approve a command, that is part of the turn. Time between turns does not
count, because `TurnStart` overwrites the timestamp.

When no record exists, `elapsed` is 0, so a `TurnStart` followed by an immediate
`TurnEnd` stays silent, and a `TurnEnd` from a session that never started (a
restarted Crush, say) does not notify with a bogus duration.

### Why the guard compares milliseconds

An earlier version compared the millisecond `elapsed` against the second
`threshold`, so `5000 < 30` was false and every turn notified. A follow-up
"fix" that negated the comparison silenced everything instead. Both are pinned
by tests (see Verification).

## 4. The process-id check

`measure()` also compares the recorded pid with the current parent pid:

```js
if (previous && previous.pid !== parentPid) { /* treat turn as fresh */ }
```

If the record belongs to a different Crush process, the start time is dropped
and the turn is measured from scratch. This stops a stale timestamp from a
previous `crush` run (yesterday's session) from making the next turn look hours
long. The decision uses `procIdle()`, which samples `/proc/<pid>/stat` CPU ticks
of the parent and all its descendants over 250ms:

- a child burning CPU means real work is in flight, so the old start still counts;
- an idle parent means nothing was running, so the clock resets.

Caveat: `TurnEnd` does not fire when the provider errors, only `StopFailure`
does. The record stays behind until the next run notices the dead or changed pid
and resets it. `StopFailure` and `Interrupt` are not wired to notifications yet.

## 5. Delivering the notification

The escaped sequence is OSC 9:

```
ESC ] 9 ; Crush finished (1m35s): <last message> BEL
```

Ghostty renders it as a native desktop notification. Control characters are
stripped and the body is capped at 160 characters first, so a message cannot
smuggle a second escape sequence into your terminal.

`notify()` sends it three ways:

| Path | Mechanism | Covers |
|------|-----------|--------|
| stdout | Crush writes hook stdout to the terminal | attached terminal outside tmux |
| spool file | `~/.local/state/crush-notify/spool/*.osc`; `drain.js` replays them as a zsh `precmd` hook | the pane you are actually looking at |
| tmux client tty | `tmux run-shell -b` writes the bytes to the tty of every client attached to the Crush session | terminal is focused on another pane or session |

### Which terminals get the sequence

Terminals do not ignore an OSC 9 they do not understand, they print the body as
plain text, which is what makes a notification look like it took over the
session. The guard is therefore an exclusion, not an allowlist:
`printsOsc9()` skips only a `TERM` that names a terminal without notification
support (`dumb`, `unknown`).

An allowlist of `xterm-ghostty`/`ghostty`/`xterm-kitty`/`wezterm` defined the
bug for a while: `TERM` inside the container is what tmux and ssh report
(`xterm-256color`, `tmux-256color`, `screen-256color`), never the Ghostty
window on the Mac. Every turn logged `skipped ... (no OSC 9)` and no path
delivered anything, because stdout is suppressed inside tmux and the spool was
never written. `supportsOsc9()` still exists for tests and documentation, but
delivery no longer depends on it.

Two guards keep the printed copy away from panes that would show it as text:

- inside tmux the hook returns an empty string for stdout, because Crush prints
  hook stdout into whatever pane is open;
- if `list-panes` shows the client is not looking at the pane Crush runs in
  (`TMUX_PANE`), the hook skips both stdout and the client-tty write and leaves
  the notification to the spool replay, which only an idle prompt picks up.

`drain.js` applies the same exclusion before replaying anything.

### Why the tmux path is wrapped in passthrough

tmux only forwards escape sequences it recognizes, and OSC 9 is not one of
them: a sequence written into a pane, or via `send-keys`, is swallowed before
it reaches the terminal. Wrapping the sequence in DCS passthrough
(`ESC Ptmux; ESC <sequence> ESC \`) makes tmux hand the bytes to the terminal
verbatim. That requires `allow-passthrough on`, which `tmux/tmux.conf` sets;
`entrypoint.sh` also adds it to `~/.tmux.conf` copies that predate it. Set
`CRUSH_NOTIFY_PASSTHROUGH=0` to send the sequence unwrapped.

The bytes go to the *client* tty, resolved with `list-clients`, rather than
into the pane. `send-keys` writes into the pane's input stream, where the bytes
land in the shell's buffer and mangle whatever you were typing. `run-shell -b`
detaches the write so a turn is never held up, and the hook gives up quickly on
every delivery path: failures are logged and it still exits 0.

Each client gets its own `run-shell -b` write ending in `; true`. A single
combined script was the second bug: clients come and go, so a tty listed by
`list-clients` can be closed by the time the write runs, and one dead tty made
the whole script exit 2. Because that failure was inside a detached
`run-shell -b`, tmux printed the script and `returned 2` into the pane instead
of notifying, and no client got the sequence.

The prompt drain exists because only the shell can print an escape sequence
into its own pane; tmux cannot inject one into a program it is not running.

Spool files are named by the `Date.now()` millisecond they were written and
capped at 32, oldest dropped first. `sweep()` drops the ones stamped inside a
finished run's window (inclusive, compared as zero-padded strings so no float
or BigInt rounding is involved), so a notification from a previous `crush`
that exited without a prompt never surfaces later. Files older than 12 hours
are pruned as well, and the `SessionEnd` hook runs the sweep when a session
closes.

## Controls

| What | How |
|------|-----|
| Threshold | `CRUSH_NOTIFY_THRESHOLD=<seconds>` (default 8), e.g. in `~/start.sh` |
| Mute | `touch ~/.local/state/crush-notify/disabled` |
| Log | `~/.local/state/crush-notify/hook.log` |
| Disable the prompt drain | `CRUSH_NOTIFY_NO_DRAIN=1` |
| Send the sequence unwrapped | `CRUSH_NOTIFY_PASSTHROUGH=0` |

Terminal support: kitty and WezTerm read OSC 9; macOS Terminal.app and iTerm2 do
not. The sequence is harmless in terminals that ignore it. As a fallback on the
client machine, Ghostty can notify on any command finish with
`notify-on-command-finish = always` or `unfocused`, but that fires far more than
long turns.

## Verification

```sh
node --test scripts/test-crush-notify.js
```

The suite injects the clock, so the 7.9s/8s boundary is tested in both
directions, along with OSC 9 formatting, control-character stripping, the kill
switch, tmux targeting, the spool cap, orphaned-turn collapse, and the drain
(tty, pipe, missing spool). It also pins the two delivery bugs by driving
`enqueue()` with a fixed client listing: a pass-through `TERM` still delivers,
a term that cannot render is skipped, and each client gets its own write that
cannot fail the others. One test runs `writeScript()` through `/bin/sh` and
compares the bytes, because a split or requoted sequence prints as text.

Checking by hand:

```sh
# The hook must not log "skipped ... (no OSC 9)" for a tmux/ssh TERM
tail ~/.local/state/crush-notify/hook.log
# A spool file appearing here means the turn notified
ls ~/.local/state/crush-notify/spool
# Each client gets one write; none may exit non-zero
tmux list-clients -F '#{client_session} #{client_name} #{client_termname}'
```

Known gaps: notification attribution on a Mac with several tmux sessions sharing
one Ghostty window is untested, and the hook paths assume the container layout
(`/etc/crush/notify/`), so this does not run on a bare macOS install.
