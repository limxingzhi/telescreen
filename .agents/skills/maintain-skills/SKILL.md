---
name: maintain-skills
description: Check the vendored skills in skills/ against their upstream sources and update stale ones while preserving local customizations. Use when the user asks to sync, update, or refresh skills, check which vendored skills are outdated, or maintain skills against upstream.
user-invocable: true
argument-hint: "Skill to sync (e.g. tdd) or 'all'"
---

# Maintain Skills

The `skills/` directory vendors skills from upstream repos. Each vendored SKILL.md carries a `Source:` line (or a `source:` frontmatter field) pointing at its upstream location. This skill diffs local skills against their upstreams and applies updates while preserving the repo's local conventions.

## Upstream sources

| Local skill | Upstream repo |
|---|---|
| wayfinder, tdd, prototype, diagnose, teach, handoff, grill-me | mattpocock/skills |
| git-advanced-workflows | wshobson/agents |
| unslop | cursor/plugins |

(`check-versions` in `.agents/skills/` is repo-specific and has no upstream.)

## Procedure

1. Report status:
   ```
   tsx .agents/skills/maintain-skills/sync-skills.ts all
   ```
   Or a single skill: `tsx .agents/skills/maintain-skills/sync-skills.ts tdd`. The script shallow-clones upstreams into `/tmp/skill-upstream` (cached and refreshed each run) and diffs each skill against its source. `✓` = current, `↑` = differs, `?` = no upstream tracked, `!` = fetch or path error.

2. Update a stale skill:
   ```
   tsx .agents/skills/maintain-skills/sync-skills.ts tdd --apply
   ```
   copies upstream files over the local ones, skipping upstream `agents/` packaging dirs. It refuses to apply stub SKILL.md files unless `--force` is passed. After applying, restore the local conventions below.

3. Re-run the report and confirm the remaining diffs are only the documented local deviations.

4. Verify with `docker build -t telescreen .` when Docker is available.

## Local conventions to preserve

- **Frontmatter**: keep `user-invocable: true` and `argument-hint` on manually-invoked skills (AGENTS.md preference). Prefer them over upstream's `disable-model-invocation: true`.
- **Attribution**: keep the `Source:` / `source:` line pointing at upstream.
- **Descriptions**: keep the repo's trigger-rich descriptions; upstream rewrites often shorten them.
- **Names**: keep local skill names and H1 titles (e.g. `diagnose`, not upstream's `diagnosing-bugs`).
- **Behaviour**: keep deliberate local choices (e.g. handoff saves to `~/.handoff/`).
- **Never vendor** upstream `agents/*.yaml`: OpenAI packaging, unused here.

## Special cases

- **grill-me**: upstream SKILL.md is a one-line stub ("Call the Skill tool with 'grilling'."); its content moved to packaging this repo does not vendor. Keep the local full version and skip updates to it.
- **handoff**: the local save path `~/.handoff/` is deliberate.
- **diagnose**: the local name and H1 intentionally differ from the upstream dir name (`diagnosing-bugs`).

## Adding a new vendored skill

Copy the upstream files, apply the frontmatter conventions above, and ensure a `Source:` line is present so the script can track it.
