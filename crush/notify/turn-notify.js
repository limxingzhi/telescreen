#!/usr/bin/env node
// Crush TurnStart/TurnEnd hook: notify the terminal when a long turn ends.
//
// A turn lasting CRUSH_NOTIFY_THRESHOLD seconds or more (default 30, wall
// clock from TurnStart, permission prompts included) emits an OSC 9 desktop
// notification, which Ghostty renders natively. The sequence goes three ways:
// stdout of the TurnEnd hook, a spool file replayed by the shell prompt, and
// the pane tty of the tmux session running Crush.
//
// Everything is best-effort: failures are logged and the hook still exits 0,
// so a turn is never delayed or blocked.
//
// Usage: turn-notify.js   (JSON payload on stdin)

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const TITLE = "Crush finished";
const SPOOL_TTL_MS = 12 * 3600 * 1000;
export const SPOOL_CAP = 32;
const SAMPLE_MS = 250;

export function config(env = process.env) {
  const dir = path.join(env.XDG_STATE_HOME || path.join(os.homedir(), ".local/state"), "crush-notify");
  return {
    stateDir: dir,
    spoolDir: path.join(dir, "spool"),
    logFile: path.join(dir, "hook.log"),
    disableFlag: path.join(dir, "disabled"),
    threshold: Number(env.CRUSH_NOTIFY_THRESHOLD || 30),
  };
}

export function log(settings, message) {
  try {
    fs.mkdirSync(path.dirname(settings.logFile), { recursive: true });
    fs.appendFileSync(settings.logFile, `${new Date().toISOString()} ${message}\n`);
  } catch {
    // logging never takes a turn down
  }
}

// --- notification text -----------------------------------------------------

export function humanize(seconds) {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${hours}h${String(minutes).padStart(2, "0")}m`;
  if (minutes) return `${minutes}m${String(secs).padStart(2, "0")}s`;
  return `${secs}s`;
}

export function sanitize(text, limit = 160) {
  const cleaned = String(text ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/;/g, ",")
    .trim();
  return cleaned.slice(0, limit);
}

export function osc9(title, body = "") {
  let payload = sanitize(title);
  if (body) payload += `: ${sanitize(body)}`;
  return `\x1b]9;${payload}\x07`;
}

export function hexBytes(raw) {
  return [...Buffer.from(raw, "utf8")].map((b) => b.toString(16).padStart(2, "0")).join(" ");
}

// --- turn clock ------------------------------------------------------------

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

function statFields(pid) {
  const raw = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
  return raw.slice(raw.lastIndexOf(")") + 2).split(" ");
}

export function cpuTicks(pid) {
  const fields = statFields(pid);
  // After the command name, state is index 0 and utime is index 11.
  return [11, 12, 13, 14].reduce((sum, i) => sum + Number(fields[i]), 0);
}

export function descendants(root) {
  const kids = new Map();
  for (const entry of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    let ppid;
    try {
      ppid = Number(statFields(entry)[1]);
    } catch {
      continue;
    }
    if (!kids.has(ppid)) kids.set(ppid, []);
    kids.get(ppid).push(Number(entry));
  }
  const found = new Set();
  const stack = [root];
  while (stack.length) {
    for (const child of kids.get(stack.pop()) || []) {
      if (found.has(child)) continue;
      found.add(child);
      stack.push(child);
    }
  }
  return found;
}

// True when nothing under `root` burned CPU during a short window. A model
// call or a long tool run keeps a child busy; a quiet window means the parent
// is waiting and the turn being measured was abandoned (ctrl-c).
export async function procIdle(root, sampleMs = SAMPLE_MS) {
  const before = new Map();
  for (const pid of [root, ...descendants(root)]) {
    try {
      before.set(pid, cpuTicks(pid));
    } catch {
      // process is gone; nothing to sample
    }
  }
  await new Promise((resolve) => setTimeout(resolve, sampleMs));
  for (const [pid, ticks] of before) {
    try {
      if (cpuTicks(pid) !== ticks) return false;
    } catch {
      // exiting processes are not proof of work
    }
  }
  return true;
}

// Returns how long the current turn has been running and stores `now` as the
// start of the next one.
export async function measure(settings, session, parentPid, now) {
  const file = path.join(settings.stateDir, `${session || "default"}.json`);
  let previous = null;
  try {
    previous = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    previous = null;
  }
  let start = previous && typeof previous.since === "number" ? previous.since : null;
  if (previous && previous.pid !== parentPid) {
    // A different live parent is a different session, so this is its first
    // turn. A dead parent with live workers is Crush still working: SessionEnd
    // interrupts the turn, so that turn never reported its end. Only an idle
    // parent means nothing was running.
    let stale;
    if (alive(previous.pid)) stale = true;
    else stale = await procIdle(parentPid);
    if (stale) {
      start = null;
      pruneSpool(settings, now);
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ pid: parentPid, since: now }));
  return start === null ? 0 : Math.max(0, now - start);
}

// --- delivery --------------------------------------------------------------

export function pruneSpool(settings, now) {
  let names;
  try {
    names = fs.readdirSync(settings.spoolDir);
  } catch {
    return;
  }
  for (const name of names) {
    const file = path.join(settings.spoolDir, name);
    try {
      if (now - fs.statSync(file).mtimeMs > SPOOL_TTL_MS) fs.unlinkSync(file);
    } catch {
      // raced with the drain
    }
  }
}

export function spool(settings, payload) {
  fs.mkdirSync(settings.spoolDir, { recursive: true });
  const names = fs.readdirSync(settings.spoolDir).filter((n) => n.endsWith(".osc")).sort();
  while (names.length >= SPOOL_CAP) {
    try {
      fs.unlinkSync(path.join(settings.spoolDir, names.shift()));
    } catch {
      // already gone
    }
  }
  fs.writeFileSync(path.join(settings.spoolDir, `${Date.now() * 1e6}.osc`), payload);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function findPane(listing, target) {
  const wanted = target.replace(/-\d+$/, "");
  const rows = listing.split("\n").filter((line) => line.includes("\t"));
  for (const row of rows) {
    const [name, pane] = row.split("\t");
    if (name === target || name.replace(/-\d+$/, "") === wanted) return [pane, name];
  }
  for (const row of rows) {
    const [name, pane] = row.split("\t");
    if (name.startsWith("crush")) return [pane, name];
  }
  return ["", ""];
}

// Write the OSC bytes to the pane tty of the session running Crush.
// send-keys -H writes to the pane's tty (the client, when the pane runs a
// terminal program); display-message leaves the same bytes on the status
// line. Detached via run-shell -b so the turn is never held up.
export function enqueue(queueBin, raw, target, run = execFile) {
  if (!queueBin) return Promise.resolve(false);
  return new Promise((resolve) => {
    run(queueBin, ["list-panes", "-a", "-F", "#{session_name}\t#{pane_id}"], { timeout: 2000 }, (err, stdout) => {
      if (err) return resolve(false);
      const [pane, name] = findPane(String(stdout), target);
      const where = pane || name || target || "crush";
      const script = [
        [queueBin, "send-keys", "-H", "-t", where, ...hexBytes(raw).split(" ")],
        [queueBin, "display-message", "-t", where, "-d", "5000", raw],
      ]
        .map((args) => args.map(shellQuote).join(" "))
        .join("; ");
      try {
        spawn(queueBin, ["run-shell", "-b", script], { detached: true, stdio: "ignore" }).unref();
        resolve(true);
      } catch {
        resolve(false);
      }
    });
  });
}

// --- hook entry ------------------------------------------------------------

export async function notify(settings, session, elapsed, payload, inTmux, queueBin, enqueueFn) {
  const text = osc9(`${TITLE} (${humanize(elapsed / 1000)})`, payload.last_assistant_message);
  spool(settings, text);
  if (inTmux()) await enqueueFn(queueBin, text, session);
  log(settings, `notified session=${session} elapsed=${Math.round(elapsed / 1000)}s`);
  return text;
}

export async function handle(raw, settings, opts = {}) {
  const {
    now = () => Date.now(),
    parentPid = process.ppid,
    inTmux = () => Boolean(process.env.TMUX),
    queueBin: bin = null,
    enqueueFn = enqueue,
  } = opts;
  const queueBin = bin || tmuxBinary();

  let payload = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = {};
  }
  const event = String(payload.event || "").trim();
  const session = String(process.env.TMUX_SESSION || payload.session_id || "");
  const at = now();

  if (event === "TurnStart") {
    await measure(settings, session, parentPid, at);
    return "";
  }
  if (event !== "TurnEnd") return "";
  if (fs.existsSync(settings.disableFlag)) return "";

  const elapsed = await measure(settings, session, parentPid, at);
  const threshold = Number(settings.threshold) || 30;
  if (Number(elapsed) < threshold * 1000) return "";
  return notify(settings, session, elapsed, payload, inTmux, queueBin, enqueueFn);
}

export function tmuxBinary() {
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    const candidate = path.join(dir, "tmux");
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}

export async function main(stdin = process.stdin) {
  const settings = config();
  let output = "";
  try {
    const chunks = [];
    for await (const chunk of stdin) chunks.push(chunk);
    output = await handle(Buffer.concat(chunks).toString("utf8"), settings);
  } catch (err) {
    try {
      log(settings, `error: ${err?.stack || err}`);
    } catch {
      // nothing left to do
    }
  }
  if (output) {
    // A closed stdout (pipe reader gone, no tty) must not fail the hook
    process.stdout.on("error", () => {});
    process.stdout.write(output);
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
