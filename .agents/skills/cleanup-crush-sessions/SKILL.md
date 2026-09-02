---
name: cleanup-crush-sessions
description: Declutter crush session history — group sessions by what they actually did, retain the relevant representative in each group, and delete the rest, including orphaned sub-agent sessions. Use when the user asks to clean up, group, prune, or delete crush sessions, or purge subagents.
user-invocable: true
disable-model-invocation: true
argument-hint: "Cleanup scope: moderate | conservative | aggressive"
---

Run when the user asks to clean up crush sessions (group them, keep the relevant ones, discard the rest).

Sessions live per project in a SQLite DB at the crush data directory (from `crush_info` → `data_directory`, e.g. `<project>/.crush/crush.db`). All inspection below is read-only.

## Concepts

- **Top-level sessions**: rows with an empty `parent_session_id`. These are what `crush session list` shows — the resume menu. Titles are auto-generated from the first prompt and unreliable; group by message content, not title.
- **Sub-agent sessions**: rows with a non-empty `parent_session_id`. Their stored id is composite (`<uuid>$$call_<...>`, e.g. `0533b7a3-8886-4b3e-9c41-ee8eb2a8c8df$$call_d62726bfa0f34241bb82ee50`). They never appear in `crush session list`, cannot be deleted by hash prefix, and are usually orphans of deleted sessions.
- **Active session**: the top row of `crush session list` (most recently updated, its first user message is the current request). Never delete it.
- Deleting a session cascades to its messages/files/read_files. Deletion is irreversible — always confirm the keep/delete plan with the user first.

## Procedure

1. Snapshot the current list:
   ```
   crush session list
   ```

2. Print per-session summaries to group by actual topic (title alone is misleading):
   ```
   tsx .agents/skills/cleanup-crush-sessions/session-summary.ts
   ```
   Shows, for every top-level session: short id, date, message count, first/last user message, and last assistant reply. Requires Node ≥ 22 (`node:sqlite`). Point at another project's DB with a positional path arg.

3. Group sessions by theme — typical groups seen in this repo: repeated check-versions maintenance runs, one-off "do a commit" chores, distinct feature/config work (skill adds, config tweaks), throwaway command runs. Completed duplicates are discardable; keep the active session plus recent or still-relevant representatives (e.g. the newest config/skill work, the latest recurring maintenance run).

4. Present the groups with a concrete keep/delete list and confirm the scope. Common scopes:
   - `moderate`: active session + newest session of each distinct piece of work (recommended)
   - `conservative`: newest session of every group
   - `aggressive`: only the active session

5. Delete top-level sessions by hash prefix:
   ```
   crush session delete <short-id>
   ```
   One call per session. Skip the active session.

6. Purge remaining sub-agent sessions (or any the user flags):
   ```
   tsx .agents/skills/cleanup-crush-sessions/session-summary.ts --children
   ```
   lists their exact ids. Delete each with the full stored id — quote it, the `$$` is literal:
   ```
   crush session delete '<uuid>$$call_<...>'
   ```

7. Verify: `crush session list` shows only the intended sessions, and (optionally) the DB row counts match — `sessions`, `messages`, `files`, `read_files` tables in the data-dir `crush.db`.
