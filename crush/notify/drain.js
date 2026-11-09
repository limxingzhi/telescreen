#!/usr/bin/env node
// Replay Crush notifications spooled by turn-notify.js.
//
// Installed from zshrc as a precmd hook: the prompt of the pane you are in
// emits any notification that piled up while you were looking elsewhere. Only
// the shell itself can print into its pane; tmux cannot inject an escape
// sequence into a program it is not running.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, supportsOsc9 } from "./turn-notify.js";

const SPOOL_TTL_MS = 12 * 3600 * 1000;

export function drain(spoolDir, out = process.stdout, now = Date.now(), term = process.env.TERM) {
  // A terminal without OSC 9 support prints the payload as text (see
  // supportsOsc9), which is the takeover this drain is meant to avoid.
  if (!out.isTTY || !supportsOsc9(term)) return 0;
  let entries;
  try {
    entries = fs.readdirSync(spoolDir).filter((name) => name.endsWith(".osc")).sort();
  } catch {
    return 0;
  }
  const replayed = [];
  for (const name of entries) {
    const file = path.join(spoolDir, name);
    try {
      if (now - fs.statSync(file).mtimeMs > SPOOL_TTL_MS) {
        fs.unlinkSync(file);
        continue;
      }
      replayed.push(fs.readFileSync(file, "utf8"));
      fs.unlinkSync(file);
    } catch {
      // raced with another drain; skip it
    }
  }
  if (replayed.length) out.write(replayed.join(""));
  return replayed.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  drain(config().spoolDir);
}
