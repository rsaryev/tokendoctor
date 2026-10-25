import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { analyzeSession, cost, summarize } from '../lib/sessions.mjs'

let n = 0
const turn = (minute, usage, { model = 'claude-opus-5-5', id } = {}) => ({
  type: 'assistant',
  timestamp: new Date(Date.UTC(2026, 9, 1, 0, minute)).toISOString(),
  message: { id: id ?? `m${n++}`, model, usage, content: [] },
})
const u = (read, write, out = 100) => ({ input_tokens: 10, cache_read_input_tokens: read, cache_creation_input_tokens: write, output_tokens: out })

test('cost weights cache reads, writes by TTL and output', () => {
  assert.equal(cost({ input_tokens: 10, cache_read_input_tokens: 1000, output_tokens: 2 }), 10 + 100 + 10)
  assert.equal(cost({ cache_creation_input_tokens: 100, cache_creation: { ephemeral_1h_input_tokens: 100 } }), 200)
  assert.equal(cost({ cache_creation_input_tokens: 100 }), 125)
})

test('streamed lines of one response count once', () => {
  const s = analyzeSession([turn(0, u(0, 1000), { id: 'a' }), turn(0, u(0, 1000), { id: 'a' })])
  assert.equal(s.turns, 1)
})

test('a cache rebuild after a long gap is put down to the TTL, after a compaction to compaction', () => {
  const idle = analyzeSession([turn(0, u(100000, 1000)), turn(30, u(0, 100000))])
  assert.equal(idle.rebuilds['idle past the cache TTL'].n, 1)
  const compacted = analyzeSession([
    turn(0, u(100000, 1000)),
    { subtype: 'compact_boundary', timestamp: new Date(Date.UTC(2026, 9, 1, 0, 1)).toISOString(), compactMetadata: { trigger: 'auto', preTokens: 700000 } },
    turn(2, u(0, 50000)),
  ])
  assert.equal(compacted.rebuilds.compaction.n, 1)
  assert.equal(compacted.compactions[0].preTokens, 700000)
})

test('late compaction, subagents on Opus and long sessions are reported', () => {
  const big = analyzeSession(
    Array.from({ length: 500 }, (_, i) => turn(i, u(500000, 1000))),
    [{ type: 'general-purpose', rows: Array.from({ length: 50 }, (_, i) => turn(i, u(300000, 5000))) }],
  )
  const ids = summarize([big]).findings.map((f) => f.id)
  assert.deepEqual(ids, ['late-compaction', 'subagents-on-top-model', 'long-sessions'])
})

test('subagents on Sonnet and small sessions report nothing', () => {
  const s = analyzeSession([turn(0, u(20000, 1000), { model: 'claude-sonnet-5-5' })], [
    { type: 'Explore', rows: [turn(1, u(10000, 1000), { model: 'claude-haiku-5-5' })] },
  ])
  assert.deepEqual(summarize([s]).findings, [])
})

test('only images read repeatedly are reported', () => {
  const read = (id, path) => [
    { type: 'assistant', timestamp: 't', message: { content: [{ type: 'tool_use', id, name: 'Read', input: { file_path: path } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id }] } },
  ]
  const rows = [turn(0, u(0, 100)), ...[1, 2, 3].flatMap((i) => [...read(`p${i}`, '/x/shot.png'), ...read(`t${i}`, '/x/a.ts')])]
  const f = summarize([analyzeSession(rows)]).findings.find((x) => x.id === 'images-read-repeatedly')
  assert.match(f.detail, /shot\.png \(3x\)/)
  assert.doesNotMatch(f.detail, /a\.ts/)
})

test('the CLI reads transcripts under the config folder and prints no message text', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tokendoctor-sessions-'))
  try {
    const proj = join(dir, 'projects', '-p')
    mkdirSync(join(proj, 's1', 'subagents'), { recursive: true })
    const secret = { type: 'user', message: { content: 'private words' } }
    writeFileSync(join(proj, 's1.jsonl'), [secret, turn(0, u(1000, 100))].map((r) => JSON.stringify(r)).join('\n'))
    writeFileSync(join(proj, 's1', 'subagents', 'agent-1.jsonl'), JSON.stringify(turn(1, u(1000, 100))))
    writeFileSync(join(proj, 's1', 'subagents', 'agent-1.meta.json'), JSON.stringify({ agentType: 'Explore' }))
    const bin = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'tokendoctor-sessions')
    const r = spawnSync(process.execPath, [bin, '--json'], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: dir, CLAUDE_CONFIG_DIR: dir } })
    assert.equal(r.status, 0, r.stderr)
    const out = JSON.parse(r.stdout)
    assert.equal(out.totals.sessions, 1)
    assert.equal(out.totals.agents.Explore.runs, 1)
    assert.doesNotMatch(r.stdout, /private words/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
