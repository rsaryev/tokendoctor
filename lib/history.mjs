// Daily totals kept in <config>/tokendoctor/history.jsonl, one JSON row per finished day, so the
// trend outlives Claude Code's transcript cleanup (cleanupPeriodDays, 30 by default).
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { daily, loadSessions, localDay } from './sessions.mjs'

const MAX_BACKFILL_DAYS = 30

export const historyPath = (configDir) => join(configDir, 'tokendoctor', 'history.jsonl')

// Rows by date; a date written twice (two sessions starting at once) keeps the last row.
export function readHistory(configDir) {
  const path = historyPath(configDir)
  if (!existsSync(path)) return []
  const byDate = new Map()
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line) continue
    try {
      const row = JSON.parse(line)
      if (row.date) byDate.set(row.date, row)
    } catch {}
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

// Appends every finished day not yet recorded, at most MAX_BACKFILL_DAYS back. Today is left out
// because it is still running. Returns the dates written.
export function recordHistory(configDir, now = new Date()) {
  const today = localDay(now)
  const known = new Set(readHistory(configDir).map((r) => r.date))
  const rows = daily(loadSessions(configDir, { days: MAX_BACKFILL_DAYS + 1 })).filter(
    (r) => r.date < today && !known.has(r.date) && now - new Date(r.date) <= MAX_BACKFILL_DAYS * 864e5,
  )
  if (!rows.length) return []
  mkdirSync(join(configDir, 'tokendoctor'), { recursive: true })
  appendFileSync(historyPath(configDir), rows.map((r) => JSON.stringify(r) + '\n').join(''))
  return rows.map((r) => r.date)
}

// Recorded days plus live transcripts; for a date in both, the transcripts win.
export function trend(configDir, days) {
  const live = daily(loadSessions(configDir, { days }))
  const liveDates = new Set(live.map((r) => r.date))
  const cutoff = localDay(Date.now() - days * 864e5)
  const old = readHistory(configDir).filter((r) => r.date >= cutoff && !liveDates.has(r.date))
  return [...old, ...live].filter((r) => r.date >= cutoff).sort((a, b) => (a.date < b.date ? -1 : 1))
}
