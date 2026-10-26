import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { combine, compare, measure, measures } from '../lib/bench.mjs'
import { analyzeSession } from '../lib/sessions.mjs'

let n = 0
const turn = (day, read, model = 'claude-opus-5') => ({
  type: 'assistant',
  timestamp: `2026-10-${day}T12:00:00.000Z`,
  message: { id: `m${n++}`, model, usage: { input_tokens: 0, cache_read_input_tokens: read, output_tokens: 0 } },
})

test('measures are normalised per turn and per day', () => {
  const s = analyzeSession([turn(10, 500000), turn(10, 100000), turn(11, 300000)], [{ type: 'general-purpose', rows: [turn(10, 10000, 'claude-sonnet-5')] }])
  const { totals, days } = measure([s])
  assert.equal(days.length, 2)
  const m = measures({ ...totals })
  assert.equal(m.avgContext, 300000)
  assert.equal(m.costPerTurn, (90000 + 1000) / 3)
  assert.equal(m.bigContextShare, 50000 / 90000)
  assert.equal(m.subagentTopModel, 0)
})

test('snapshots of two machines add up, and each machine keeps its own columns', () => {
  const snap = (machine, label, since, read) => ({
    bench: 1, machine, label, period: { since, until: since }, ...measure([analyzeSession([turn(Number(since.slice(8)), read)])]),
  })
  const groups = compare([snap('work', 'before', '2026-10-10', 500000), snap('home', 'before', '2026-10-10', 100000), snap('work', 'after', '2026-10-20', 100000)])
  assert.deepEqual(groups.map((g) => g.machine), ['work', 'home', 'all machines'])
  assert.deepEqual(groups[0].columns.map((c) => c.label), ['before', 'after'])
  const all = groups[2].columns[0]
  assert.equal(all.totals.turns, 2)
  assert.equal(all.measures.avgContext, 300000)
  assert.deepEqual(combine([{ byModel: { opus: 1 } }, { byModel: { opus: 2, sonnet: 1 } }]).byModel, { opus: 3, sonnet: 1 })
})

let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tokendoctor-bench-'))
  mkdirSync(join(dir, 'projects', '-secret-project'), { recursive: true })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

test('save writes a snapshot without project names or message text, and compare reads it back', () => {
  const rows = [{ type: 'user', message: { content: 'private words' } }, turn(10, 500000), turn(12, 1000)]
  writeFileSync(join(dir, 'projects', '-secret-project', 's.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n'))
  const bin = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'tokendoctor-bench')
  const env = { PATH: dirname(process.execPath), HOME: dir, CLAUDE_CONFIG_DIR: dir }
  const run = (...args) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env })
  const out = join(dir, 'bench')
  const r = run('save', '--label', 'before', '--machine', 'work', '--dir', out, '--since', '2026-10-01', '--until', '2026-10-11')
  assert.equal(r.status, 0, r.stderr)
  const [file] = readdirSync(out)
  assert.equal(file, 'work-before-2026-10-01_2026-10-11.json')
  const text = readFileSync(join(out, file), 'utf8')
  assert.doesNotMatch(text, /secret|private words/)
  assert.equal(JSON.parse(text).totals.turns, 1)
  const c = run('compare', '--dir', out)
  assert.equal(c.status, 0, c.stderr)
  assert.match(c.stdout, /context per main turn, K tokens\s+500\.0/)
  assert.equal(run('save', '--machine', 'work').status, 2)
})
