import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parseValue, TUNABLES, tunableOp } from '../lib/tunables.mjs'

test('values are checked per key and env values are written as strings', () => {
  assert.deepEqual(tunableOp('autoCompactWindow', 400000), { op: 'set', key: 'autoCompactWindow', value: 400000 })
  assert.throws(() => tunableOp('autoCompactWindow', 50), /not a valid value/)
  assert.throws(() => tunableOp('effortLevel', 'max'), /not a valid value/)
  assert.deepEqual(tunableOp('env.MAX_MCP_OUTPUT_TOKENS', 25000), { op: 'set', key: 'env.MAX_MCP_OUTPUT_TOKENS', value: '25000' })
  assert.deepEqual(tunableOp('idleCompaction', undefined), { op: 'unset', key: 'idleCompaction' })
})

test('hooks, permissions and unknown keys are refused', () => {
  for (const key of ['hooks', 'permissions', 'permissions.allow', 'env.ANTHROPIC_API_KEY', 'apiKeyHelper']) {
    assert.throws(() => tunableOp(key, 'x'), /not a setting tokendoctor changes/)
  }
  assert.ok(!Object.keys(TUNABLES).some((k) => /hook|permission|apiKey|allow/i.test(k)))
})

test('parseValue reads JSON and keeps plain text', () => {
  assert.equal(parseValue('true'), true)
  assert.equal(parseValue('400000'), 400000)
  assert.equal(parseValue('sonnet'), 'sonnet')
})

test('tokendoctor-set dry-runs, then writes with a backup into a sandbox config', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tokendoctor-set-'))
  try {
    const bin = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'tokendoctor-set')
    const run = (...a) => spawnSync(process.execPath, [bin, ...a], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: dir, CLAUDE_CONFIG_DIR: dir } })
    const dry = run('promptSuggestionEnabled', 'false')
    assert.equal(dry.status, 0, dry.stderr)
    assert.match(dry.stdout, /Dry run/)
    assert.equal(run('promptSuggestionEnabled', 'false', '--write').status, 0)
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')), { promptSuggestionEnabled: false })
    const w = run('autoCompactWindow', '400000', '--write')
    assert.match(w.stdout, /backup: .*\.bak/)
    assert.equal(run('hooks', '{}', '--write').status, 2)
    assert.equal(JSON.parse(run('--list', '--json').stdout).length, Object.keys(TUNABLES).length)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
