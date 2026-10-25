import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'statusline.sh')
const hasJq = spawnSync('jq', ['--version']).status === 0
const NOW = 1_000_000
let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tokendoctor-sl-'))
  mkdirSync(join(dir, 'config'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const payload = (over = {}) =>
  JSON.stringify({
    model: { display_name: 'Sonnet 5.5' },
    workspace: { current_dir: dir },
    context_window: { total_input_tokens: 150000, context_window_size: 1000000 },
    cost: { total_cost_usd: 24.23 },
    prompt_cache: { hit_ratio: 0.984, warm: true, expires_at: NOW + 3600 },
    ...over,
  })

const render = (input, env = {}) => {
  const r = spawnSync('bash', [script], {
    input,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: dir, CLAUDE_CONFIG_DIR: join(dir, 'config'), TOKENDOCTOR_NOW: String(NOW), ...env },
  })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout.replace(/\x1b\[[0-9;]*m/g, '').trim()
}

test('a quiet line: model, folder, tokens against the compaction point, cache time, cost', { skip: !hasJq }, () => {
  writeFileSync(join(dir, 'config', 'settings.json'), JSON.stringify({ autoCompactWindow: 400000 }))
  assert.equal(render(payload()), `Sonnet 5.5 · ${dir.split('/').pop()} · 150k/367k · cache 1h · $24`)
})

test('the compaction point follows the env, then per-model settings, then the model window', { skip: !hasJq }, () => {
  assert.match(render(payload(), { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '250k' }), / 150k\/217k /)
  writeFileSync(join(dir, 'config', 'settings.json'), JSON.stringify({ autoCompactWindow: 300000, modelSettings: { 'claude-sonnet-5-5': { autoCompactWindow: 500000 } } }))
  assert.match(render(payload({ model: { id: 'claude-sonnet-5-5', display_name: 'Sonnet 5.5' } })), / 150k\/467k /)
  rmSync(join(dir, 'config', 'settings.json'))
  assert.match(render(payload({ context_window: { total_input_tokens: 100000, context_window_size: 200000 } })), / 100k\/167k /)
})

test('right after /compact the count shows -- instead of a stale number', { skip: !hasJq }, () => {
  const out = render(payload({ context_window: { total_input_tokens: 300000, context_window_size: 1000000, current_usage: null } }), { CLAUDE_STATUSLINE_COMPACT_AT: '367000' })
  assert.match(out, / --\/367k /)
})

test('current_usage counts input, cache writes and cache reads', { skip: !hasJq }, () => {
  const cw = { total_input_tokens: 0, context_window_size: 1000000, current_usage: { input_tokens: 2000, cache_creation_input_tokens: 8000, cache_read_input_tokens: 190000 } }
  assert.match(render(payload({ context_window: cw }), { CLAUDE_STATUSLINE_COMPACT_AT: '367000' }), / 200k\/367k /)
})

test('the cache: time left, a warning in the last minutes, what a cold cache re-sends, a low hit rate', { skip: !hasJq }, () => {
  const env = { CLAUDE_STATUSLINE_COMPACT_AT: '367000' }
  assert.match(render(payload({ prompt_cache: { hit_ratio: 0.99, warm: true, expires_at: NOW + 3599 } }), env), / cache 1h /)
  assert.match(render(payload({ prompt_cache: { hit_ratio: 0.99, warm: true, expires_at: NOW + 170 } }), env), / cache cold in 3m /)
  assert.match(render(payload({ prompt_cache: { hit_ratio: 0.99, warm: false, recache_tokens_if_cold: 350400 } }), env), / cache cold, resend 350k /)
  assert.match(render(payload({ prompt_cache: { hit_ratio: 0.62, warm: true, expires_at: NOW + 1200 } }), env), / cache 20m 62% hit /)
})

const limits = (h5, d7, over = {}) => ({
  rate_limits: { five_hour: { used_percentage: h5, resets_at: NOW + 4320 }, seven_day: { used_percentage: d7, resets_at: NOW + 302400 } },
  ...over,
})

test('limits stay quiet when they last until the reset', { skip: !hasJq }, () => {
  // 5h: 76% of the window gone, 60% used. Week: half gone, 30% used.
  const out = render(payload(limits(60, 30)), { CLAUDE_STATUSLINE_COMPACT_AT: '367000', TOKENDOCTOR_PACE_FILE: join(dir, 'pace.log') })
  assert.match(out, / · 5h 60% · week 30% · \$24$/)
})

test('without history, "→ 100% in" uses the average pace of the window', { skip: !hasJq }, () => {
  // Week: 3.5 days gone, 70% used, so 20 points/day; 30 points last 1.5 days, less than the 3.5 left.
  const out = render(payload(limits(60, 70)), { CLAUDE_STATUSLINE_COMPACT_AT: '367000', TOKENDOCTOR_PACE_FILE: join(dir, 'pace.log') })
  assert.match(out, / week 70% → 100% in 1d12h /)
})

test('with readings, 5h uses the last hour and the week the last day', { skip: !hasJq }, () => {
  const pace = join(dir, 'pace.log')
  // 40% → 70% over the last 30 minutes: 1 point a minute, 30 points left = 30m, before the 1h12m reset.
  writeFileSync(pace, `${NOW - 1800} 40 30\n${NOW - 900} 55 30\n`)
  const out = render(payload(limits(70, 30)), { CLAUDE_STATUSLINE_COMPACT_AT: '367000', TOKENDOCTOR_PACE_FILE: pace })
  assert.match(out, / 5h 70% → 100% in 30m /)
  assert.match(readFileSync(pace, 'utf8'), new RegExp(`^${NOW} 70 30$`, 'm'))
})

test('a busy hour does not raise the weekly forecast on its own', { skip: !hasJq }, () => {
  const pace = join(dir, 'pace.log')
  // Week: 30% → 34% over the last 20 hours (a slow day), then one busy hour. 4.8 points a day
  // leaves 66 points for 13.75 days, past the 3.5-day reset: no forecast.
  writeFileSync(pace, `${NOW - 72000} 10 30\n${NOW - 3600} 20 33\n`)
  assert.match(render(payload(limits(30, 34)), { CLAUDE_STATUSLINE_COMPACT_AT: '367000', TOKENDOCTOR_PACE_FILE: pace }), / week 34% · \$24$/)
})

test('the pace file keeps 26 hours', { skip: !hasJq }, () => {
  const pace = join(dir, 'pace.log')
  writeFileSync(pace, `${NOW - 94000} 1 1\n${NOW - 3000} 2 2\n`)
  render(payload(limits(10, 10)), { CLAUDE_STATUSLINE_COMPACT_AT: '367000', TOKENDOCTOR_PACE_FILE: pace })
  assert.equal(readFileSync(pace, 'utf8'), `${NOW - 3000} 2 2\n${NOW} 10 10\n`)
})

test('cost under ten dollars keeps cents', { skip: !hasJq }, () => {
  assert.match(render(payload({ cost: { total_cost_usd: 1.426 } }), { CLAUDE_STATUSLINE_COMPACT_AT: '367000' }), / \$1\.43$/)
})
