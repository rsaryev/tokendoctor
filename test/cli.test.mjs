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
  dir = mkdtempSync(join(tmpdir(), 'tokendoctor-cli-'))
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
  const r = run('tokendoctor-audit', ['--json', '--project', project])
  assert.equal(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  assert.ok(out.findings.some((f) => f.id === 'compact-threshold-undocumented'))
  assert.equal(out.facts.version, null)
  assert.ok(!r.stdout.includes('do-not-print'))
})

test('audit reports an unparsable settings file', () => {
  writeFileSync(join(project, '.claude', 'settings.json'), '{ "a": 1, }')
  const out = JSON.parse(run('tokendoctor-audit', ['--json', '--project', project]).stdout)
  assert.ok(out.findings.some((f) => f.id === 'settings-unreadable'))
})

test('apply is a dry run until --write, and --write leaves a backup', () => {
  const file = join(dir, 'config', 'settings.json')
  writeFileSync(file, JSON.stringify({ autoCompactThreshold: 0.5 }, null, 2) + '\n')
  const dry = run('tokendoctor-apply', ['compact-threshold-undocumented', '--project', project])
  assert.equal(dry.status, 0, dry.stderr)
  assert.match(dry.stdout, /Dry run/)
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { autoCompactThreshold: 0.5 })

  const real = run('tokendoctor-apply', ['compact-threshold-undocumented', '--project', project, '--write'])
  assert.equal(real.status, 0, real.stderr)
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), {})
  assert.match(real.stdout, /backup: .*\.bak/)
})

test('apply refuses an unknown finding, a finding without a fix and a bad scope', () => {
  assert.equal(run('tokendoctor-apply', ['nope', '--project', project]).status, 1)
  writeFileSync(join(project, '.claude', 'settings.json'), '{ bad')
  const noFix = run('tokendoctor-apply', ['settings-unreadable', '--project', project])
  assert.equal(noFix.status, 1)
  assert.match(noFix.stderr, /no automatic fix/)
  assert.equal(run('tokendoctor-apply', ['x', '--scope', 'galaxy', '--project', project]).status, 2)
})

test('both commands are executable files with a node shebang', () => {
  for (const name of ['tokendoctor-audit', 'tokendoctor-apply']) {
    assert.equal(readFileSync(bin(name), 'utf8').split('\n')[0], '#!/usr/bin/env node')
    execFileSync('test', ['-x', bin(name)])
  }
})

test('undo lists what tokendoctor-set wrote and puts one change back, unless it changed again since', () => {
  const settings = join(dir, 'config', 'settings.json')
  writeFileSync(settings, JSON.stringify({ promptCacheTtl: '1h' }))
  assert.equal(run('tokendoctor-set', ['promptCacheTtl', '"5m"', '--write']).status, 0)
  assert.equal(run('tokendoctor-set', ['tokendoctor.slide', 'true', '--write']).status, 0)
  const journal = JSON.parse(run('tokendoctor-undo', ['--json']).stdout)
  assert.deepEqual(journal.map((e) => e.changes), [
    [{ key: 'pluginConfigs.tokendoctor@tokendoctor.options.slide', after: true }],
    [{ key: 'promptCacheTtl', before: '1h', after: '5m' }],
  ])
  // A dry run first, then the write; the slide comes off and the cache stays.
  assert.match(run('tokendoctor-undo', ['1']).stdout, /Dry run/)
  assert.equal(JSON.parse(readFileSync(settings, 'utf8')).pluginConfigs['tokendoctor@tokendoctor'].options.slide, true)
  assert.match(run('tokendoctor-undo', ['1', '--write']).stdout, /written/)
  const after = JSON.parse(readFileSync(settings, 'utf8'))
  assert.equal(after.pluginConfigs['tokendoctor@tokendoctor'].options.slide, undefined)
  assert.equal(after.promptCacheTtl, '5m')
  // The cache changed again since change 4 (the oldest: the undo itself was noted too) wrote it: that one is kept.
  assert.equal(run('tokendoctor-set', ['promptCacheTtl', '"1h"', '--write']).status, 0)
  assert.match(run('tokendoctor-undo', ['4', '--write']).stdout, /kept promptCacheTtl: changed again since \(now "1h"\)\nNothing to put back/)
})
