import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const bin = (name) => join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', name)
let dir
let project
let env

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'token-doctor-cli-'))
  project = join(dir, 'project')
  mkdirSync(join(project, '.claude'), { recursive: true })
  mkdirSync(join(dir, 'config'))
  // A fake home and no `claude` on PATH keep the run independent of the machine's own setup.
  env = { PATH: dirname(process.execPath), HOME: dir, CLAUDE_CONFIG_DIR: join(dir, 'config') }
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const run = (name, args) => spawnSync(process.execPath, [bin(name), ...args], { env, encoding: 'utf8' })

test('audit --json reports facts and findings and never prints settings', () => {
  writeFileSync(join(dir, 'config', 'settings.json'), JSON.stringify({ autoCompactThreshold: 0.5, secretish: 'do-not-print' }))
  const r = run('token-doctor-audit', ['--json', '--project', project])
  assert.equal(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  assert.ok(out.findings.some((f) => f.id === 'compact-threshold-undocumented'))
  assert.equal(out.facts.version, null)
  assert.ok(!r.stdout.includes('do-not-print'))
})

test('audit reports an unparsable settings file', () => {
  writeFileSync(join(project, '.claude', 'settings.json'), '{ "a": 1, }')
  const out = JSON.parse(run('token-doctor-audit', ['--json', '--project', project]).stdout)
  assert.ok(out.findings.some((f) => f.id === 'settings-unreadable'))
})

test('apply is a dry run until --write, and --write leaves a backup', () => {
  const file = join(dir, 'config', 'settings.json')
  writeFileSync(file, JSON.stringify({ autoCompactThreshold: 0.5 }, null, 2) + '\n')
  const dry = run('token-doctor-apply', ['compact-threshold-undocumented', '--project', project])
  assert.equal(dry.status, 0, dry.stderr)
  assert.match(dry.stdout, /Dry run/)
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { autoCompactThreshold: 0.5 })

  const real = run('token-doctor-apply', ['compact-threshold-undocumented', '--project', project, '--write'])
  assert.equal(real.status, 0, real.stderr)
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), {})
  assert.match(real.stdout, /backup: .*\.bak/)
})

test('apply refuses an unknown finding, a finding without a fix and a bad scope', () => {
  assert.equal(run('token-doctor-apply', ['nope', '--project', project]).status, 1)
  writeFileSync(join(project, '.claude', 'settings.json'), '{ bad')
  const noFix = run('token-doctor-apply', ['settings-unreadable', '--project', project])
  assert.equal(noFix.status, 1)
  assert.match(noFix.stderr, /no automatic fix/)
  assert.equal(run('token-doctor-apply', ['x', '--scope', 'galaxy', '--project', project]).status, 2)
})

test('both commands are executable files with a node shebang', () => {
  for (const name of ['token-doctor-audit', 'token-doctor-apply']) {
    assert.equal(readFileSync(bin(name), 'utf8').split('\n')[0], '#!/usr/bin/env node')
    execFileSync('test', ['-x', bin(name)])
  }
})
