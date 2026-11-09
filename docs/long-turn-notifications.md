# Long-turn notifications

When a Crush turn runs for 30 seconds or more, the container fires a desktop
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

## 3. Deciding whether 30 seconds passed

On `TurnEnd` it calls `measure()` again, which returns `now - since`, the
wall-clock elapsed time in milliseconds (`turn-notify.js:148-173`). The guard
then buys the comparison in matching units:

```js
const threshold = Number(settings.threshold) || 30;   // seconds
if (Number(elapsed) < threshold * 1000) return "";    // 30_000 ms
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
| tmux pane tty | `tmux run-shell -b` with `send-keys -H` (hex bytes) into the pane running Crush | you are in another pane or session |

The prompt drain exists because only the shell can print an escape sequence
into its own pane; tmux cannot inject one into a program it is not running.
`send-keys -H` passes raw bytes rather than typed text, and `run-shell -b`
detaches it so a turn is never held up. The hook gives up quickly on every
delivery path: failures are logged and it still exits 0.

Spool files are pruned after 12 hours and capped at 32, oldest dropped first.

## Controls

| What | How |
|------|-----|
| Threshold | `CRUSH_NOTIFY_THRESHOLD=<seconds>` (default 30), e.g. in `~/start.sh` |
| Mute | `touch ~/.local/state/crush-notify/disabled` |
| Log | `~/.local/state/crush-notify/hook.log` |
| Disable the prompt drain | `CRUSH_NOTIFY_NO_DRAIN=1` |

Terminal support: kitty and WezTerm read OSC 9; macOS Terminal.app and iTerm2 do
not. The sequence is harmless in terminals that ignore it. As a fallback on the
client machine, Ghostty can notify on any command finish with
`notify-on-command-finish = always` or `unfocused`, but that fires far more than
long turns.

## Verification

```sh
node --test scripts/test-crush-notify.js
```

The suite injects the clock, so the 29.9s/30s boundary is tested in both
directions, along with OSC 9 formatting, control-character stripping, the kill
switch, tmux targeting, the spool cap, orphaned-turn collapse, and the drain
(tty, pipe, missing spool).

Known gaps: notification attribution on a Mac with several tmux sessions sharing
one Ghostty window is untested, and the hook paths assume the container layout
(`/etc/crush/notify/`), so this does not run on a bare macOS install.
