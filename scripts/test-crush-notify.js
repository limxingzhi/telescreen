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
      threshold: 30,
    },
  };
}

function harness(t, settings) {
  const clock = { now: 1_000_000 };
  const calls = [];
  const runHook = async (event, { session = "s1", message = "done", inTmux = true } = {}) => {
    const payload = { event, session_id: session };
    if (message !== null) payload.last_assistant_message = message;
    return hook.handle(JSON.stringify(payload), settings, {
      now: () => clock.now,
      parentPid: process.pid,
      inTmux: () => inTmux,
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
  clock.now += 10_000;
  assert.strictEqual(await runHook("TurnEnd"), "");
  assert.deepStrictEqual(spooled(), []);
});

test("29.9s stays silent, 30s notifies", async (t) => {
  const { settings } = workspace(t);
  const { clock, runHook, spooled } = harness(t, settings);
  await runHook("TurnStart");
  clock.now += 29_900;
  assert.strictEqual(await runHook("TurnEnd"), "");
  assert.deepStrictEqual(spooled(), []);
  await runHook("TurnStart");
  clock.now += 30_000;
  assert.notStrictEqual(await runHook("TurnEnd"), "");
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
  assert.deepStrictEqual(calls, [["tmux", spooled()[0], "crush-work"]]);
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

test("findPane matches then falls back", () => {
  const listing = "work\t%1\ncrush-main\t%2\n";
  assert.deepStrictEqual(hook.findPane(listing, "work"), ["%1", "work"]);
  assert.deepStrictEqual(hook.findPane(listing, "crush-main-2"), ["%2", "crush-main"]);
  assert.deepStrictEqual(hook.findPane(listing, "unknown"), ["%2", "crush-main"]);
});

test("drain replays and removes", (t) => {
  const { settings } = workspace(t);
  fs.mkdirSync(settings.spoolDir, { recursive: true });
  fs.writeFileSync(path.join(settings.spoolDir, "1.osc"), "\x1b]9;one\x07");
  fs.writeFileSync(path.join(settings.spoolDir, "2.osc"), "\x1b]9;two\x07");
  const chunks = [];
  const out = { isTTY: true, write: (s) => chunks.push(s) };
  assert.strictEqual(drain.drain(settings.spoolDir, out), 2);
  assert.strictEqual(chunks.join(""), "\x1b]9;one\x07\x1b]9;two\x07");
  assert.deepStrictEqual(fs.readdirSync(settings.spoolDir), []);
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
