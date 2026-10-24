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

Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.
