#!/usr/bin/env node
// Crush TurnStart/TurnEnd hook: notify the terminal when a long turn ends.
//
// A turn lasting CRUSH_NOTIFY_THRESHOLD seconds or more (default 8, wall
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

// Terminals that decode OSC 9 into a desktop notification. Anywhere else the
// sequence is not ignored: the xterm parser prints the body ("Crush finished
// (2m51s): ...") as plain text in the pane, which then looks like the
// notification took over the session.
const OSC9_TERMS = ["xterm-ghostty", "ghostty", "xterm-kitty", "wezterm"];
// Terms that do not name a terminal, only a pass-through that tmux or ssh put
// in front of it. The real terminal's capabilities are unknown from here.
const PASS_THROUGH_TERMS = ["xterm-256color", "screen", "screen-256color", "tmux", "tmux-256color", "linux", "vt100", "ansi"];
// Terminals that render nothing they do not understand, so a sequence shown
// there is printed as text.
const TEXT_ONLY_TERMS = ["dumb", "unknown", "cons25"];

export function supportsOsc9(term) {
  return OSC9_TERMS.includes(String(term || "").toLowerCase());
}

export function printsOsc9(term) {
  const name = String(term || "").toLowerCase();
  if (!name) return false;
  if (TEXT_ONLY_TERMS.includes(name)) return true;
  return !supportsOsc9(name) && !PASS_THROUGH_TERMS.includes(name);
}

export function config(env = process.env) {
  const dir = path.join(env.XDG_STATE_HOME || path.join(os.homedir(), ".local/state"), "crush-notify");
  return {
    stateDir: dir,
    spoolDir: path.join(dir, "spool"),
    logFile: path.join(dir, "hook.log"),
    disableFlag: path.join(dir, "disabled"),
    threshold: Number(env.CRUSH_NOTIFY_THRESHOLD || 8),
    passthrough: env.CRUSH_NOTIFY_PASSTHROUGH !== "0",
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

// --- turn clock ------------------------------------------------------------

export function cpuTicks(pid) {
  const fields = statFields(pid);
  // After the command name, state is index 0 and utime is index 11.
  return [11, 12, 13, 14].reduce((sum, i) => sum + Number(fields[i]), 0);
}

// Fields of /proc/<pid>/stat after the executable name, which may itself hold
// spaces and parentheses.
function statFields(pid) {
  const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
  return stat.slice(stat.lastIndexOf(")") + 2).split(" ");
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
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
export async function measure(settings, session, parentPid, now, run = now) {
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
  fs.writeFileSync(file, JSON.stringify({ pid: parentPid, since: now, run }));
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

// Spool file names are `Date.now()` in milliseconds. The window is inclusive
// and compared as zero-padded strings: equal length, so lexicographic order is
// numeric order, and it sidesteps BigInt entirely. Only stamps inside the run's
// window are dropped, so a cleaner for another run never touches its files.
export function sweep(settings, from, to) {
  if (!(to > from)) return 0;
  const width = String(Math.trunc(to)).length;
  const pad = (ms) => String(Math.trunc(ms)).padStart(width, "0");
  const low = pad(from);
  const high = pad(to);
  let names;
  try {
    names = fs.readdirSync(settings.spoolDir);
  } catch {
    return 0;
  }
  let dropped = 0;
  for (const name of names) {
    if (!/^\d+\.osc$/.test(name)) continue;
    const born = name.slice(0, -4).padStart(width, "0");
    if (born < low || born > high) continue;
    try {
      fs.unlinkSync(path.join(settings.spoolDir, name));
      dropped += 1;
    } catch {
      // raced with the drain
    }
  }
  return dropped;
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
  fs.writeFileSync(path.join(settings.spoolDir, `${Date.now()}.osc`), payload);
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

// Only the pane Crush is running in prints the notification as text. A user
// who has moved on to a different pane has no shell of ours waiting at a
// prompt, so the spool replay is the path that reaches them.
export function inPane(listing, target) {
  const pane = String(process.env.TMUX_PANE || "");
  if (!pane) return true;
  const wanted = target.replace(/-\d+$/, "");
  const rows = listing.split("\n").filter((line) => line.includes("\t"));
  for (const row of rows) {
    const [name, paneId] = row.split("\t");
    if ((name === target || name.replace(/-\d+$/, "") === wanted) && paneId === pane) return true;
  }
  return false;
}

// tmux only forwards escape sequences it knows about, so an OSC 9 written
// into a pane is swallowed. Wrapping it in DCS passthrough makes tmux hand the
// bytes to the terminal verbatim, which needs `allow-passthrough on`. Writing
// to the attached client's tty keeps the sequence away from the shell's input
// buffer, where send-keys would have mixed it with whatever you were typing.
export function passthrough(settings, raw) {
  if (settings.passthrough) return `\x1bPtmux;\x1b${raw.replaceAll("\x1b", "\x1b\x1b")}\x1b\\`;
  return raw;
}

// A single write per client: tmux hands passthrough bytes to the terminal
// parser as they arrive, and a sequence split across two writes is parsed as
// two broken ones, which leaves the payload printed as text. A soft reset
// (DECSTR) first means a terminal that does print the body starts the
// notification on a clean line. A write that fails (tty already closed) must
// not fail the whole script, so it always ends in `true`.
export function writeScript(client, raw) {
  return `printf %s ${shellQuote(`\x1b[!p${raw}`)} > ${shellQuote(client)}; true`;
}

export function spawnClient(bin, script) {
  try {
    spawn(bin, ["run-shell", "-b", script], { detached: true, stdio: "ignore" }).unref();
    return true;
  } catch {
    return false;
  }
}

// Deliver to every tmux client attached to the session running Crush, so the
// notification lands in the terminal looking at that session. Detached via
// run-shell -b so the turn is never held up.
//
// The client TERM is not the terminal that receives the bytes: tmux and ssh
// both report their own name (`xterm-256color`, `screen-256color`), so an
// allowlist here skipped every client reached over the ssh hop this exists
// for. Only a term that names a terminal without OSC 9 is skipped.
export function enqueue(queueBin, raw, target, run = execFile, settings = {}, send = spawnClient) {
  if (!queueBin) return Promise.resolve(false);
  const formatted = passthrough(settings, raw);
  return new Promise((resolve) => {
    run(queueBin, ["list-clients", "-F", "#{client_session}\t#{client_name}\t#{client_termname}\t#{client_terminal_features}"], { timeout: 2000 }, (err, stdout) => {
      if (err) return resolve(false);
      const wanted = String(target).replace(/-\d+$/, "");
      const clients = String(stdout)
        .split("\n")
        .filter((line) => line.includes("\t"))
        .map((line) => line.split("\t"))
        .filter(([name]) => name === target || name.replace(/-\d+$/, "") === wanted)
        // A terminal can also advertise OSC 9 support for its term name.
        .filter(([, , term, features = ""]) => features.includes("osc9") || !printsOsc9(term))
        .map(([, client]) => client);
      if (!clients.length) return resolve(false);
      // One write per client: a dead tty can only fail its own write.
      for (const client of clients) send(queueBin, writeScript(client, formatted));
      resolve(true);
    });
  });
}

// --- hook entry ------------------------------------------------------------

export async function notify(settings, session, elapsed, payload, term, inTmux, queueBin, enqueueFn, now = Date.now(), samePane = true) {
  const text = osc9(`${TITLE} (${humanize(elapsed / 1000)})`, payload.last_assistant_message);
  const seconds = Math.round(elapsed / 1000);
  sweep(settings, now - elapsed - 1000, now + 2000);
  if (printsOsc9(term)) {
    // Printing the sequence would dump the body into the pane as text, so the
    // only safe paths (stdout to the attached terminal, prompt spool) are off.
    log(settings, `skipped session=${session} elapsed=${seconds}s term=${term || "unset"} (no OSC 9)`);
    return "";
  }
  spool(settings, text);
  if (inTmux()) await enqueueFn(queueBin, text, session, undefined, settings);
  log(settings, `notified session=${session} elapsed=${seconds}s`);
  // Crush prints hook stdout, and that copy lands in whatever pane is open.
  return inTmux() || !samePane ? "" : text;
}

export async function handle(raw, settings, opts = {}) {
  const {
    now = () => Date.now(),
    parentPid = process.ppid,
    inTmux = () => Boolean(process.env.TMUX),
    queueBin: bin = null,
    enqueueFn = enqueue,
    term = process.env.TERM,
    paneOf = inPane,
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
    await measure(settings, session, parentPid, at, at);
    return "";
  }
  if (event === "SessionEnd") {
    endSession(settings, session, at);
    return "";
  }
  if (event !== "TurnEnd") return "";
  if (fs.existsSync(settings.disableFlag)) return "";

  const elapsed = await measure(settings, session, parentPid, at);
  const threshold = Number(settings.threshold) || 8;
  if (Number(elapsed) < threshold * 1000) return "";
  const panned = inTmux() && !paneOf(await listPanes(queueBin), session);
  // Only the spool replay can land with the terminal showing another pane.
  const deliver = panned ? () => Promise.resolve(false) : enqueueFn;
  return notify(settings, session, elapsed, payload, term, inTmux, queueBin, deliver, at, !panned);
}

export function endSession(settings, session, now = Date.now()) {
  const file = path.join(settings.stateDir, `${session || "default"}.json`);
  let run = null;
  try {
    run = JSON.parse(fs.readFileSync(file, "utf8")).run;
  } catch {
    run = null;
  }
  // A zero-width window would sweep nothing, so a run that starts and ends in
  // the same millisecond still looks at the spool.
  if (typeof run === "number") sweep(settings, run, Math.max(now, run + 1));
  try {
    fs.unlinkSync(file);
  } catch {
    // never written
  }
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

// Panes of the session running Crush, as "session\tpane-id" rows. Used to tell
// whether the terminal is still looking at the pane Crush lives in.
export function listPanes(queueBin, run = execFile) {
  if (!queueBin) return Promise.resolve("");
  return new Promise((resolve) => {
    run(queueBin, ["list-panes", "-a", "-F", "#{session_name}\t#{pane_id}"], { timeout: 2000 }, (err, stdout) => {
      resolve(err ? "" : String(stdout));
    });
  });
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
