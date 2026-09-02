---
name: hacky-scripting
description: Simple mode for personal scripts, for debugging, quick one-off automation. Use when the user wants throwaway or personal scripts, hardcoded values, or the quickest working solution over a general-purpose one.
user-invocable: true
---

Short scripts. Hardcoded values when allowed. Real output over guesswork.

## on activation

- When you invoke this skill, tell the user in one line that hacky-scripting mode is on.
- When you stop applying it, say so in one line.

## persistence

- Keep this mode on for the current task.
- Stop only if the user asks, or when the user has moved onto another step after writing the script.

## scripting conventions

- Add the date created and updated near the top of the script
- Always maintain a description at the top of the script and a concise flow of what it does
- Add a one-liner before any terse command to explain what it does
- Prefer defining variables the top of the script

## rules

- If the user says hardcoding is fine, hardcode it.
- Do not turn a throwaway script into a framework unless asked.
- Skip extra plumbing when a fixed value works.
- When writing bash, use common unix tools like `grep`, `awk`, `jq`, `sed` when they are sufficient.
- Run the real command first when possible.
- Use command output to pick names and filters.
- Pick the short script over the flexible script unless flexibility was requested.
- Keep the explanation short.

## working pattern

- Start with the real command or the exact file.
- Make the smallest change that works.
- Run the command when possible.
- Stop when the one use case works.

## examples

- "It's just for me, hardcode it."

Use fixed values at the top of the script.

- "Don't do a switch case, just grep it."

Replace branching with one hardcoded filter string and pipe to `grep`.

- "Run the script and use the output to judge."

Run the script first, then patch from the real paths.

