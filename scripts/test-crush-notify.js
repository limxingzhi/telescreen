#!/usr/bin/env node
// Tests for crush/notify, run with: node --test scripts/test-crush-notify.js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");
const { fileURLToPath, pathToFileURL } = require("node:url");

const NOTIFY = path.join(__dirname, "..", "crush", "notify");
const TITLE = "Crush finished";

let hook;
let drain;

test.before(async () => {
  hook = await import(pathToFileURL(path.join(NOTIFY, "turn-notify.js")).href);
  drain = await import(pathToFileURL(path.join(NOTIFY, "drain.js")).href);
});

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "crush-notify-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    root,
    settings: {
      stateDir: path.join(root, "state"),
      spoolDir: path.join(root, "spool"),
      logFile: path.join(root, "log"),
      disableFlag: path.join(root, "disabled"),
      threshold: 8,
    },
  };
}

function harness(t, settings) {
  const clock = { now: 1_000_000 };
  const calls = [];
  const runHook = async (event, { session = "s1", message = "done", inTmux = true, term = "xterm-ghostty", paneInSession = true } = {}) => {
    const payload = { event, session_id: session };
    if (message !== null) payload.last_assistant_message = message;
    return hook.handle(JSON.stringify(payload), settings, {
      now: () => clock.now,
      parentPid: process.pid,
      inTmux: () => inTmux,
      term,
      paneOf: () => paneInSession,
      queueBin: "tmux",
      enqueueFn: async (...args) => {
        calls.push(args);
        return true;
      },
    });
  };
  const spooled = () => {
    if (!fs.existsSync(settings.spoolDir)) return [];
    return fs.readdirSync(settings.spoolDir).filter((n) => n.endsWith(".osc")).sort()
      .map((n) => fs.readFileSync(path.join(settings.spoolDir, n), "utf8"));
  };
  return { clock, calls, runHook, spooled };
}

test("short turn is silent", async (t) => {
  const { settings } = workspace(t);
  const { clock, runHook, spooled } = harness(t, settings);
  await runHook("TurnStart");
  clock.now += 3_000;
  assert.strictEqual(await runHook("TurnEnd"), "");
  assert.deepStrictEqual(spooled(), []);
});

test("7.9s stays silent, 8s notifies", async (t) => {
  const { settings } = workspace(t);
  const { clock, runHook, spooled } = harness(t, settings);
  await runHook("TurnStart");
  clock.now += 7_900;
  assert.strictEqual(await runHook("TurnEnd"), "");
  assert.deepStrictEqual(spooled(), []);
  await runHook("TurnStart");
  clock.now += 8_000;
  await runHook("TurnEnd");
  assert.strictEqual(spooled().length, 1);
});

test("long turn spools OSC 9", async (t) => {
  const { settings } = workspace(t);
  const { clock, runHook, spooled } = harness(t, settings);
  await runHook("TurnStart");
  clock.now += 95_000;
  const text = await runHook("TurnEnd", { inTmux: false });
  assert.deepStrictEqual(spooled(), [`\x1b]9;${TITLE} (1m35s): done\x07`]);
  assert.strictEqual(text, spooled()[0]);
});

test("message control chars stripped", async (t) => {
  const { settings } = workspace(t);
  const { clock, runHook, spooled } = harness(t, settings);
  await runHook("TurnStart");
  clock.now += 100_000;
  await runHook("TurnEnd", { message: "a\x1bb\x07c;d\ne" });
  const body = spooled()[0];
  assert.strictEqual(body.split("\x1b").length - 1, 1);
  assert.ok(body.endsWith("\x07"));
  assert.strictEqual(body, `\x1b]9;${TITLE} (1m40s): a b c,d e\x07`);
});

test("long message truncated to 160 chars", async (t) => {
  const { settings } = workspace(t);
  const { clock, runHook, spooled } = harness(t, settings);
  await runHook("TurnStart");
  clock.now += 100_000;
  await runHook("TurnEnd", { message: "x".repeat(400) });
  assert.ok(spooled()[0].length <= `\x1b]9;${TITLE} (1m40s): `.length + 160 + 1);
});

test("kill switch silences", async (t) => {
  const { settings } = workspace(t);
  const { clock, runHook, spooled } = harness(t, settings);
  fs.writeFileSync(settings.disableFlag, "");
  await runHook("TurnStart");
  clock.now += 100_000;
  await runHook("TurnEnd");
  assert.deepStrictEqual(spooled(), []);
});

test("non-turn events are ignored", async (t) => {
  const { settings } = workspace(t);
  const { clock, runHook, spooled } = harness(t, settings);
  await runHook("TurnStart");
  clock.now += 100_000;
  await runHook("StopFailure");
  assert.deepStrictEqual(spooled(), []);
});

test("tmux delivery targets the session", async (t) => {
  const { settings } = workspace(t);
  const { clock, runHook, spooled, calls } = harness(t, settings);
  const previous = process.env.TMUX_SESSION;
  process.env.TMUX_SESSION = "crush-work";
  t.after(() => {
    if (previous === undefined) delete process.env.TMUX_SESSION;
    else process.env.TMUX_SESSION = previous;
  });
  await runHook("TurnStart");
  clock.now += 100_000;
  await runHook("TurnEnd", { session: "other" });
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(calls[0].slice(0, 3), ["tmux", spooled()[0], "crush-work"]);
});

test("no tmux still spools", async (t) => {
  const { settings } = workspace(t);
  const { clock, runHook, spooled, calls } = harness(t, settings);
  await runHook("TurnStart");
  clock.now += 100_000;
  await runHook("TurnEnd", { inTmux: false });
  assert.deepStrictEqual(calls, []);
  assert.strictEqual(spooled().length, 1);
});

test("second TurnStart resets the clock", async (t) => {
  const { settings } = workspace(t);
  const { clock, runHook, spooled } = harness(t, settings);
  await runHook("TurnStart");
  clock.now += 100_000;
  await runHook("TurnStart");
  clock.now += 5_000;
  await runHook("TurnEnd");
  assert.deepStrictEqual(spooled(), []);
});

test("garbage input does not raise", async (t) => {
  const { settings } = workspace(t);
  const { clock, runHook } = harness(t, settings);
  await assert.doesNotReject(runHook("not json"));
});

test("spool cap keeps the newest", async (t) => {
  const { settings } = workspace(t);
  const { clock, runHook, spooled } = harness(t, settings);
  fs.mkdirSync(settings.spoolDir, { recursive: true });
  for (let i = 0; i < hook.SPOOL_CAP + 5; i += 1) {
    fs.writeFileSync(path.join(settings.spoolDir, `${String(i).padStart(20, "0")}.osc`), "x");
  }
  await runHook("TurnStart");
  clock.now += 100_000;
  await runHook("TurnEnd", { inTmux: false });
  assert.strictEqual(spooled().length, hook.SPOOL_CAP);
});

test("procIdle sees a busy child", async (t) => {
  const child = spawn("bash", ["-c", "while true; do :; done"]);
  t.after(() => child.kill());
  assert.strictEqual(await hook.procIdle(child.pid), false);
});

test("procIdle sees an idle child", async (t) => {
  const child = spawn("sleep", ["2"]);
  t.after(() => child.kill());
  assert.strictEqual(await hook.procIdle(child.pid), true);
});

test("descendants finds grandchildren", async (t) => {
  const child = spawn("bash", ["-c", "sleep 2 & wait"]);
  t.after(() => child.kill());
  let found = new Set();
  for (let i = 0; i < 20 && found.size === 0; i += 1) {
    found = hook.descendants(child.pid);
    if (found.size === 0) await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok(found.size > 0);
});

test("orphaned turn collapses to now", async (t) => {
  const { settings } = workspace(t);
  const { clock, runHook, spooled } = harness(t, settings);
  const child = spawn("sleep", ["2"]);
  t.after(() => child.kill());
  fs.mkdirSync(settings.stateDir, { recursive: true });
  fs.writeFileSync(path.join(settings.stateDir, "s1.json"), JSON.stringify({ pid: child.pid, since: clock.now - 500_000 }));
  await runHook("TurnEnd");
  assert.deepStrictEqual(spooled(), []);
});

test("humanize", () => {
  assert.strictEqual(hook.humanize(0), "0s");
  assert.strictEqual(hook.humanize(95), "1m35s");
  assert.strictEqual(hook.humanize(3725), "1h02m");
});

test("passthrough wraps the sequence in DCS", () => {
  const raw = "\x1b]9;hi\x07";
  assert.strictEqual(hook.passthrough({ passthrough: true }, raw), "\x1bPtmux;\x1b\x1b\x1b]9;hi\x07\x1b\\");
  assert.strictEqual(hook.passthrough({ passthrough: false }, raw), raw);
});

test("writeScript targets the client tty and cannot fail the script", () => {
  assert.strictEqual(
    hook.writeScript("/dev/pts/3", "\x1b]9;hi\x07"),
    "printf %s '\x1b[!p\x1b]9;hi\x07' > '/dev/pts/3'; true",
  );
});

test("enqueue writes to every client of the session", async () => {
  const seen = [];
  const run = (bin, args, opts, cb) => {
    seen.push([bin, ...args]);
    cb(null, "work\t/dev/pts/2\txterm-ghostty\nother\t/dev/pts/9\twezterm\nwork-2\t/dev/pts/5\twezterm\n");
  };
  const ok = await hook.enqueue("tmux", "\x1b]9;hi\x07", "work", run, { passthrough: true });
  assert.strictEqual(ok, true);
  assert.strictEqual(seen.length, 1);
  assert.deepStrictEqual(seen[0], ["tmux", "list-clients", "-F", "#{client_session}\t#{client_name}\t#{client_termname}\t#{client_terminal_features}"]);
});

test("enqueue gives up when no client matches", async () => {
  const run = (bin, args, opts, cb) => cb(null, "other\t/dev/pts/9\txterm-ghostty\n");
  const sent = [];
  const send = (bin, script) => sent.push(script);
  assert.strictEqual(await hook.enqueue("tmux", "x", "work", run, {}, send), false);
  assert.deepStrictEqual(sent, []);
});

test("drain replays and removes", (t) => {
  const { settings } = workspace(t);
  fs.mkdirSync(settings.spoolDir, { recursive: true });
  fs.writeFileSync(path.join(settings.spoolDir, "1.osc"), "\x1b]9;one\x07");
  fs.writeFileSync(path.join(settings.spoolDir, "2.osc"), "\x1b]9;two\x07");
  const chunks = [];
  const out = { isTTY: true, write: (s) => chunks.push(s) };
  assert.strictEqual(drain.drain(settings.spoolDir, out, Date.now(), "xterm-ghostty"), 2);
  assert.strictEqual(chunks.join(""), "\x1b]9;one\x07\x1b]9;two\x07");
  assert.deepStrictEqual(fs.readdirSync(settings.spoolDir), []);
});

test("drain leaves the spool alone for a terminal that would print the body", (t) => {
  const { settings } = workspace(t);
  fs.mkdirSync(settings.spoolDir, { recursive: true });
  fs.writeFileSync(path.join(settings.spoolDir, "1.osc"), "\x1b]9;one\x07");
  const chunks = [];
  const out = { isTTY: true, write: (s) => chunks.push(s) };
  assert.strictEqual(drain.drain(settings.spoolDir, out, Date.now(), "dumb"), 0);
  assert.deepStrictEqual(chunks, []);
  assert.strictEqual(fs.readdirSync(settings.spoolDir).length, 1);
});

// A terminal reached through tmux reports `tmux-256color` or `screen-256color`
// and one reached over ssh reports `xterm-256color`: none of those name the
// terminal that renders the sequence, so none of them may block delivery.
test("pass-through terms still drain", (t) => {
  const { settings } = workspace(t);
  fs.mkdirSync(settings.spoolDir, { recursive: true });
  fs.writeFileSync(path.join(settings.spoolDir, "1.osc"), "\x1b]9;one\x07");
  const chunks = [];
  const out = { isTTY: true, write: (s) => chunks.push(s) };
  assert.strictEqual(drain.drain(settings.spoolDir, out, Date.now(), "tmux-256color"), 1);
  assert.strictEqual(chunks.join(""), "\x1b]9;one\x07");
});

test("supportsOsc9 recognises notifying terminals only", () => {
  for (const term of ["xterm-ghostty", "ghostty", "xterm-kitty", "wezterm"]) {
    assert.strictEqual(hook.supportsOsc9(term), true, term);
  }
  for (const term of ["xterm-256color", "screen", "tmux-256color", "dumb", "", undefined]) {
    assert.strictEqual(hook.supportsOsc9(term), false, String(term));
  }
});

test("printsOsc9 only skips terms that cannot render it", () => {
  for (const term of ["xterm-ghostty", "xterm-kitty", "wezterm"]) {
    assert.strictEqual(hook.printsOsc9(term), false, term);
  }
  for (const term of ["xterm-256color", "screen", "screen-256color", "tmux-256color", "", undefined]) {
    assert.strictEqual(hook.printsOsc9(term), false, String(term));
  }  for (const term of ["dumb", "unknown"]) assert.strictEqual(hook.printsOsc9(term), true, term);
});

// The hook runs inside tmux over ssh, where TERM is the pass-through, not the
// Ghostty window. Skipping on it silenced all three delivery paths.
test("a pass-through term still notifies", async (t) => {
  const { settings } = workspace(t);
  const { clock, runHook, spooled } = harness(t, settings);
  await runHook("TurnStart");
  clock.now += 60_000;
  assert.strictEqual(await runHook("TurnEnd", { term: "xterm-256color" }), "");
  assert.strictEqual(spooled().length, 1);
});

test("a terminal showing another pane only gets the spool", async (t) => {
  const { settings } = workspace(t);
  const { clock, runHook, spooled, calls } = harness(t, settings);
  await runHook("TurnStart");
  clock.now += 60_000;
  const text = await runHook("TurnEnd", { paneInSession: false });
  assert.strictEqual(text, "");
  assert.strictEqual(spooled().length, 1);
  assert.deepStrictEqual(calls, []);
});

test("enqueue skips clients that report a terminal without OSC 9", async (t) => {
  let calls = 0;
  const spawns = [];
  const run = (bin, args, opts, cb) => {
    calls += 1;
    cb(null, "work\t/dev/pts/2\tdumb\nwork\t/dev/pts/5\txterm-ghostty\n");
  };
  const send = (bin, script) => spawns.push(script);
  assert.strictEqual(await hook.enqueue("tmux", "\x1b]9;hi\x07", "work", run, {}, send), true);
  assert.strictEqual(calls, 1);
  assert.strictEqual(spawns.length, 1);
  assert.match(spawns[0], /\/dev\/pts\/5/);
  assert.doesNotMatch(spawns[0], /\/dev\/pts\/2/);
});

test("enqueue gives up when every client reports a terminal without OSC 9", async (t) => {
  const spawns = [];
  const run = (bin, args, opts, cb) => cb(null, "work\t/dev/pts/2\tdumb\n");
  const send = (bin, script) => spawns.push(script);
  assert.strictEqual(await hook.enqueue("tmux", "x", "work", run, {}, send), false);
  assert.deepStrictEqual(spawns, []);
});

// `TERM=xterm-256color` is what tmux and ssh report, not the terminal that
// receives the bytes, so it cannot prove the terminal would print the body.
test("a client term that cannot prove OSC 9 support still gets the write", async (t) => {
  const spawns = [];
  const run = (bin, args, opts, cb) => cb(null, "work\t/dev/pts/0\txterm-256color\n");
  const send = (bin, script) => spawns.push(script);
  assert.strictEqual(await hook.enqueue("tmux", "\x1b]9;hi\x07", "work", run, {}, send), true);
  assert.strictEqual(spawns.length, 1);
});

test("one write per client so a dead tty cannot stop the live ones", async (t) => {
  const scripts = [];
  const run = (bin, args, opts, cb) => {
    cb(null, "work\t/dev/pts/2\txterm-ghostty\nwork\t/dev/pts/5\txterm-ghostty\n");
  };
  const send = (bin, script) => scripts.push(script);
  assert.strictEqual(await hook.enqueue("tmux", "\x1b]9;hi\x07", "work", run, {}, send), true);
  assert.strictEqual(scripts.length, 2);
  for (const script of scripts) assert.match(script, /; true$/);
});

test("sweep drops only files stamped inside the window", async (t) => {
  const { settings } = workspace(t);
  fs.mkdirSync(settings.spoolDir, { recursive: true });
  const stale = "1794000001000.osc";
  const inside = "1794000006000.osc";
  const late = "1794000009000.osc";
  for (const name of [stale, inside, late]) {
    fs.writeFileSync(path.join(settings.spoolDir, name), "x");
  }
  fs.writeFileSync(path.join(settings.spoolDir, "notes.txt"), "keep");
  assert.strictEqual(hook.sweep(settings, 1_794_000_005_000, 1_794_000_008_000), 1);
  assert.deepStrictEqual(fs.readdirSync(settings.spoolDir).sort(), [stale, late, "notes.txt"].sort());
});
test("SessionEnd drops what the run left in the spool", async (t) => {
  const { settings } = workspace(t);
  const { clock, runHook } = harness(t, settings);
  await runHook("TurnStart");
  await runHook("TurnEnd", { inTmux: false });
  fs.mkdirSync(settings.spoolDir, { recursive: true });
  fs.writeFileSync(path.join(settings.spoolDir, `${clock.now}.osc`), "at-start");
  fs.writeFileSync(path.join(settings.spoolDir, `${clock.now + 1}.osc`), "during");
  fs.writeFileSync(path.join(settings.spoolDir, "notes.txt"), "keep");
  await runHook("SessionEnd", { inTmux: false });
  assert.deepStrictEqual(fs.readdirSync(settings.spoolDir), ["notes.txt"]);
});
test("drain is silent on a pipe", (t) => {
  const { settings } = workspace(t);
  fs.mkdirSync(settings.spoolDir, { recursive: true });
  fs.writeFileSync(path.join(settings.spoolDir, "1.osc"), "\x1b]9;one\x07");
  const chunks = [];
  assert.strictEqual(drain.drain(settings.spoolDir, { isTTY: false, write: (s) => chunks.push(s) }), 0);
  assert.deepStrictEqual(chunks, []);
  assert.strictEqual(fs.readdirSync(settings.spoolDir).length, 1);
});

test("drain ignores a missing spool", (t) => {
  const { settings } = workspace(t);
  assert.strictEqual(drain.drain(settings.spoolDir, { isTTY: true, write: () => {} }), 0);
});

// The write runs through /bin/sh with literal control bytes inside single
// quotes, so this pins the bytes that actually leave the script. A soft reset
// (DECSTR) leads so a terminal that does print the body starts on a clean line.
test("write script reproduces the sequence byte for byte", (t) => {
  const file = path.join(workspace(t).root, "tty");
  const raw = "\x1b]9;Crush finished (1m05s): done\x07";
  const cases = [
    { passthrough: true, expected: `\x1b[!p\x1bPtmux;\x1b\x1b${raw}\x1b\\` },
    { passthrough: false, expected: `\x1b[!p${raw}` },
  ];
  for (const { passthrough, expected } of cases) {
    fs.writeFileSync(file, "");
    const settings = { passthrough };
    execFileSync("/bin/sh", ["-c", hook.writeScript(file, hook.passthrough(settings, raw))]);
    assert.strictEqual(fs.readFileSync(file, "utf8"), expected, `passthrough=${passthrough}`);
  }
});
