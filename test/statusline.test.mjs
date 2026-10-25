import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const script = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'statusline.sh')
const hasJq = spawnSync('jq', ['--version']).status === 0
let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'token-doctor-sl-'))
  mkdirSync(join(dir, 'config'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const payload = (over = {}) =>
  JSON.stringify({
    model: { display_name: 'Sonnet 5.5' },
    workspace: { current_dir: dir },
    context_window: { total_input_tokens: 150000, context_window_size: 1000000 },
    cost: { total_cost_usd: 10.589 },
    prompt_cache: { hit_ratio: 0.984, warm: true },
    ...over,
  })

const render = (input, env = {}) => {
  const r = spawnSync('bash', [script], { input, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: dir, CLAUDE_CONFIG_DIR: join(dir, 'config'), ...env } })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout.replace(/\x1b\[[0-9;]*m/g, '').trim()
}

test('the line shows the bar, tokens against the compaction point, cache and cost', { skip: !hasJq }, () => {
  writeFileSync(join(dir, 'config', 'settings.json'), JSON.stringify({ autoCompactWindow: 300000 }))
  const out = render(payload())
  assert.match(out, /Sonnet 5\.5 in /)
  assert.match(out, /█{5}░{5} 150k\/300k/)
  assert.match(out, /cache 98%/)
  assert.match(out, /\$10\.59$/)
})

test('a cold cache is marked, and a full bar is capped at ten blocks', { skip: !hasJq }, () => {
  const out = render(payload({ context_window: { total_input_tokens: 317000, context_window_size: 1000000 }, prompt_cache: { hit_ratio: 0.5, warm: false } }), { CLAUDE_STATUSLINE_COMPACT_AT: '300000' })
  assert.match(out, /█{10} 317k\/300k/)
  assert.match(out, /cache 50% cold/)
})

test('without a setting the bar falls back to the model window', { skip: !hasJq }, () => {
  assert.match(render(payload({ context_window: { total_input_tokens: 100000, context_window_size: 200000 } })), /█{5}░{5} 100k\/200k/)
})
