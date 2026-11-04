import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { collect, render } from '../lib/dashboard.mjs'

function config() {
  const dir = mkdtempSync(join(tmpdir(), 'td-dash-'))
  const project = join(dir, 'projects', '-x-proj')
  mkdirSync(join(project, 's1', 'subagents'), { recursive: true })
  const resp = (id, model, usage, extra = {}) => JSON.stringify({ type: 'assistant', timestamp: '2026-10-01T10:00:00Z', effort: 'high', ...extra, message: { id, model, usage } })
  writeFileSync(join(project, 's1.jsonl'), [
    resp('m1', 'claude-opus-5-5', { input_tokens: 10, cache_read_input_tokens: 1000, output_tokens: 20, output_tokens_details: { thinking_tokens: 5 } }),
    resp('m1', 'claude-opus-5-5', { input_tokens: 10, cache_read_input_tokens: 1000, output_tokens: 20, output_tokens_details: { thinking_tokens: 5 } }),
    JSON.stringify({ type: 'user', message: { content: 'secret prompt text' } }),
  ].join('\n'))
  writeFileSync(join(project, 's1', 'subagents', 'a.meta.json'), JSON.stringify({ agentType: 'Explore' }))
  writeFileSync(join(project, 's1', 'subagents', 'a.jsonl'), resp('a1', 'claude-haiku-5-5', { input_tokens: 5, cache_creation_input_tokens: 100, output_tokens: 10 }, { effort: 'low' }))
  return dir
}

test('collect counts each response once, splits main thread from subagent types, and keeps no text', () => {
  const dir = config()
  const d = collect(dir)
  const rows = d.rows.map((r) => ({ key: r.slice(0, 6), v: r[6] }))
  const main = rows.find((r) => r.key[4] === 'main')
  assert.equal(main.v.requests, 1, 'the repeated message id is one response')
  assert.equal(main.v.cacheRead, 1000)
  assert.equal(main.v.thinking, 5)
  // Opus 5.5: 1,000 cache-read tokens at $0.20 per million, 20 output tokens at $20 per million.
  assert.ok(Math.abs(main.v.usd.cacheRead - 1000 * 0.2e-6) < 1e-12)
  assert.ok(Math.abs(main.v.usd.output - 20 * 20e-6) < 1e-12)
  // Haiku 5.5 under 100K of prompt: a 5-minute write is 1.25 x $0.10.
  const agent = rows.find((r) => r.key[4] === 'agent:Explore')
  assert.ok(Math.abs(agent.v.usd.cacheWrite - 100 * 0.125e-6) < 1e-12)
  assert.equal(d.unpriced, 0)
  assert.deepEqual(rows.find((r) => r.key[4] === 'agent:Explore').key.slice(2, 4), ['haiku', 'low'])
  assert.equal(d.sessions.length, 1)
  assert.equal(d.sessions[0].agents, 1)
  assert.ok(!JSON.stringify(d).includes('secret prompt'))
  rmSync(dir, { recursive: true })
})

test('render puts the data and fonts in, and data cannot close the script', () => {
  const html = render({ rows: [], note: '</script><b>' }, 'a /*__FONT_SANS__*/ b /*__FONT_HEADING__*/ c /*__TOKENDOCTOR_DATA__*/null')
  assert.ok(!html.includes('</script>'))
  assert.ok(html.includes('data:font/woff2;base64,'))
  assert.ok(!html.includes('__FONT_') && !html.includes('__TOKENDOCTOR_DATA__'))
})

test('edge cases: no sessions, broken lines, responses without usage or a timestamp', () => {
  const empty = mkdtempSync(join(tmpdir(), 'td-dash-empty-'))
  const e = collect(empty)
  assert.equal(e.rows.length, 0)
  assert.equal(e.sessions.length, 0)
  assert.ok(render(e).includes('"rows":[]'))
  rmSync(empty, { recursive: true })

  const dir = mkdtempSync(join(tmpdir(), 'td-dash-odd-'))
  const project = join(dir, 'projects', '-x-odd')
  mkdirSync(project, { recursive: true })
  writeFileSync(join(project, 's.jsonl'), [
    '{not json',
    JSON.stringify({ type: 'assistant', message: { id: 'n1', model: 'claude-sonnet-5-5' } }),
    JSON.stringify({ type: 'assistant', timestamp: '2026-10-02T09:00:00Z', message: { id: 'n2', model: 'claude-sonnet-5-5', usage: { input_tokens: 3, output_tokens: 4 } } }),
    JSON.stringify({ type: 'assistant', timestamp: 'not a date', message: { id: 'n3', model: 'claude-sonnet-5-5', usage: { input_tokens: 9, output_tokens: 9 } } }),
    '',
  ].join('\n'))
  const d = collect(dir)
  assert.equal(d.rows.length, 1, 'only the response with usage and a date counts; one without a date has no day to go in')
  assert.equal(d.rows[0][6].output, 4)
  rmSync(dir, { recursive: true })
})

test('the CLI writes all of a large --json to a pipe and refuses a bad --days', async () => {
  const { spawnSync } = await import('node:child_process')
  const bin = new URL('../bin/tokendoctor-dashboard', import.meta.url).pathname
  const dir = config()
  const ok = spawnSync('node', [bin, '--json'], { env: { ...process.env, CLAUDE_CONFIG_DIR: dir }, encoding: 'utf8' })
  assert.equal(ok.status, 0)
  assert.ok(JSON.parse(ok.stdout).rows.length > 0)
  for (const bad of ['abc', '0', '-3', '1.5']) {
    const r = spawnSync('node', [bin, '--days', bad, '--json'], { env: { ...process.env, CLAUDE_CONFIG_DIR: dir }, encoding: 'utf8' })
    assert.equal(r.status, 2, `--days ${bad}`)
  }
  rmSync(dir, { recursive: true })
})
