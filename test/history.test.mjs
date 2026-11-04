import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { historyPath, readHistory, recordHistory, trend } from '../lib/history.mjs'
import { analyzeSession, daily } from '../lib/sessions.mjs'

let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tokendoctor-history-'))
  mkdirSync(join(dir, 'projects', '-p'), { recursive: true })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const at = (daysAgo, hour = 12) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, 0, 0, 0)
  return d
}
let n = 0
const turn = (when, model = 'claude-opus-5-5') => ({
  type: 'assistant',
  timestamp: when.toISOString(),
  message: { id: `m${n++}`, model, usage: { input_tokens: 1000, output_tokens: 0 } },
})
const session = (name, rows) => writeFileSync(join(dir, 'projects', '-p', `${name}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n'))

test('a session that crosses midnight is split by local day', () => {
  const rows = daily([analyzeSession([turn(at(2, 23)), turn(at(1, 1)), turn(at(1, 2), 'claude-sonnet-5-5')])])
  // 1,000 input tokens: $0.004 on Opus 5.5, $0.002 on Sonnet 5.5.
  assert.deepEqual(rows.map((r) => [r.turns, r.unit, Math.round(r.cost * 1e6)]), [[1, 'usd', 4000], [2, 'usd', 6000]])
  assert.equal(Math.round(rows[1].byModel.sonnet * 1e6), 2000)
})

test('rows written before 0.5.1 are measured again in dollars where transcripts remain', () => {
  session('a', [turn(at(2)), turn(at(1))])
  mkdirSync(dirname(historyPath(dir)), { recursive: true })
  const old = (daysAgo) => JSON.stringify({ date: daily([analyzeSession([turn(at(daysAgo))])])[0].date, cost: 1000, mainCost: 1000, bigContextCost: 0, turns: 1, sessions: 1, byModel: { opus: 1000 } })
  writeFileSync(historyPath(dir), [old(40), old(2)].join('\n') + '\n')
  recordHistory(dir)
  const rows = readHistory(dir)
  assert.deepEqual(rows.map((r) => r.unit), ['ie', 'usd', 'usd'])
  assert.equal(Math.round(rows[1].cost * 1e6), 4000)
  assert.ok(readFileSync(`${historyPath(dir)}.before-0.5.1`, 'utf8').includes('"cost":1000'))
})

test('recording writes finished days once, never today', () => {
  session('a', [turn(at(2)), turn(at(1)), turn(at(0))])
  assert.equal(recordHistory(dir).length, 2)
  assert.deepEqual(recordHistory(dir), [])
  assert.equal(readHistory(dir).length, 2)
})

test('recorded days survive transcript cleanup and show in the trend', () => {
  session('a', [turn(at(3)), turn(at(0))])
  recordHistory(dir)
  rmSync(join(dir, 'projects', '-p', 'a.jsonl'))
  session('b', [turn(at(0))])
  const rows = trend(dir, 30)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].turns, 1)
})

test('a date written twice keeps the last row', () => {
  mkdirSync(dirname(historyPath(dir)), { recursive: true })
  writeFileSync(historyPath(dir), '{"date":"2026-01-01","cost":1}\n{"date":"2026-01-01","cost":2}\nnot json\n')
  assert.deepEqual(readHistory(dir), [{ date: '2026-01-01', cost: 2 }])
})

test('the hook script prints nothing and the hook is async on startup only', () => {
  session('a', [turn(at(1))])
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const r = spawnSync(process.execPath, [join(root, 'bin', 'tokendoctor-record')], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: dir, CLAUDE_CONFIG_DIR: dir } })
  assert.equal(r.status, 0)
  assert.equal(r.stdout + r.stderr, '')
  assert.equal(readHistory(dir).length, 1)
  const hook = JSON.parse(readFileSync(join(root, 'hooks', 'hooks.json'), 'utf8')).hooks.SessionStart[0]
  assert.equal(hook.matcher, 'startup')
  assert.equal(hook.hooks[0].async, true)
})
