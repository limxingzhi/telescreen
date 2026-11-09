---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up.
argument-hint: "What will the next session be used for?"
user-invocable: true
source: https://github.com/mattpocock/skills/tree/main/skills/productivity/handoff
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save to and read from `.handoff/` in the current working directory, creating it if needed - not the home directory. There may be no repo here at all; just use the directory you are working in.

Name the file `YYYY-MM-DD-<slug>.md` with today's date and a dash-case slug for the work, e.g. `1997-11-21-continue-api-refactor.md`. Write it to `./.handoff/YYYY-MM-DD-<slug>.md`. When reading a handoff and no file is specified, use the most recent relevant handoff in `./.handoff/` - relevance beats recency, so skip unrelated work even if it is newer.

Include a "suggested skills" section in the document, which suggests skills that the agent should invoke.

## Keep handoffs current (check in and clean up constantly)

A handoff is a live document, not a one-shot artifact. Treat it as the place the next agent will land, and keep it true while you work:

- **Check in often.** At the start of a session, read the relevant handoff in `./.handoff/` before acting. Whenever you finish a chunk of work (a bug fixed, a design decided, a test passing), update the handoff in the same step - status line, resolved sections, file table, open questions - instead of batching updates at the end. Do this at least once per unit of work, not once per session.
- **Delete what is dead.** Remove sections that describe a solved problem, an abandoned approach, or a file that no longer exists. A past-tense narrative of how something was fixed belongs in the commit message; the handoff should carry only what a fresh agent still needs.
- **Retire finished handoffs.** When the work a handoff describes is done, verified, and committed, delete the file (or reduce it to a one-line pointer if a decision record is still worth keeping) rather than leaving a stale doc to be misread as current. Empty or partially-resolved handoffs on disk are worse than none.
- **Stay short.** A handoff that grows every session stops being read. If it runs longer than a screen or two, the overflow belongs in `docs/`, an ADR, or a commit message, referenced by path.
- **Keep one file per thread of work.** Do not spawn a second handoff for the same task; update the existing one so history does not fork.

Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.
