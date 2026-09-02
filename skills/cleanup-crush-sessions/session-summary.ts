#!/usr/bin/env tsx
// Summarize crush sessions so an agent can group them by actual topic.
// Usage:
//   tsx session-summary.ts [path/to/crush.db] [--top|--children|--all]
// Default db: <cwd>/.crush/crush.db (project-local data dir). Default flag: --top.

import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'

const dbPath = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : join(process.cwd(), '.crush', 'crush.db')
const flag = process.argv.find(a => a.startsWith('--')) ?? '--top'

const db = new DatabaseSync(dbPath, { readOnly: true })

function fmtTs(ts: number): string {
  if (ts < 1e11) ts *= 1000 // seconds -> ms
  else if (ts > 1e15) ts /= 1e6 // nanoseconds -> ms
  return new Date(ts).toISOString().slice(0, 16).replace('T', ' ')
}

function textOf(parts: string | null): string {
  if (!parts) return ''
  try {
    for (const part of JSON.parse(parts)) {
      if (part.type === 'text') {
        const t = String(part.data?.text ?? '').trim()
        if (t) return t
      }
    }
  } catch { /* ignore malformed parts */ }
  return ''
}

function userTexts(id: string): string[] {
  const rows = db.prepare(
    `SELECT parts FROM messages WHERE session_id = ? AND role = 'user' ORDER BY created_at`
  ).all(id) as { parts: string | null }[]
  return rows.map(r => textOf(r.parts)).filter(Boolean)
}

function lastAssistantText(id: string): string {
  const row = db.prepare(
    `SELECT parts FROM messages WHERE session_id = ? AND role = 'assistant'
     ORDER BY created_at DESC LIMIT 1`
  ).get(id) as { parts: string | null } | undefined
  return row ? textOf(row.parts) : ''
}

type Row = { id: string; parent: string; title: string; message_count: number; updated_at: number }

const topRows = db.prepare(
  `SELECT id, COALESCE(parent_session_id, '') AS parent, COALESCE(title, '') AS title,
          message_count, updated_at
   FROM sessions
   WHERE parent_session_id IS NULL OR parent_session_id = ''
   ORDER BY updated_at DESC`
).all() as Row[]
const childRows = db.prepare(
  `SELECT id, COALESCE(parent_session_id, '') AS parent, COALESCE(title, '') AS title,
          message_count, updated_at
   FROM sessions
   WHERE parent_session_id IS NOT NULL AND parent_session_id != ''
   ORDER BY updated_at DESC`
).all() as Row[]

const showTop = flag === '--top' || flag === '--all'
const showChildren = flag === '--children' || flag === '--all'

if (showTop) {
  console.log(`TOP-LEVEL SESSIONS (${topRows.length}) — shown in 'crush session list'`)
  for (const r of topRows) {
    const short = r.id.split('$')[0].slice(0, 8)
    const users = userTexts(r.id)
    const last = lastAssistantText(r.id)
    console.log('='.repeat(100))
    console.log(`${short} | ${fmtTs(r.updated_at)} | msgs=${r.message_count} | ${r.title.slice(0, 60)}`)
    console.log(`  first user : ${(users[0] ?? '').replace(/\s+/g, ' ').slice(0, 140)}`)
    if (users.length > 1) console.log(`  last  user : ${users[users.length - 1].replace(/\s+/g, ' ').slice(0, 140)}`)
    console.log(`  last  asst : ${last.replace(/\s+/g, ' ').slice(0, 160)}`)
  }
}

if (showChildren) {
  console.log(`\nSUB-AGENT SESSIONS (${childRows.length}) — hidden from 'crush session list'`)
  for (const r of childRows) {
    console.log(`${r.id} | parent=${r.parent.split('$')[0].slice(0, 8)} | msgs=${r.message_count} | ${r.title.slice(0, 60)}`)
  }
  if (childRows.length) {
    console.log('\nDelete by exact stored id (contains $$, quote it): crush session delete \'<id>\'')
  }
}
