import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { collect } from '../lib/collect.mjs'

let dir
let project
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tokendoctor-collect-'))
  project = join(dir, 'project')
  mkdirSync(project)
  process.env.CLAUDE_CONFIG_DIR = join(dir, 'config')
  mkdirSync(process.env.CLAUDE_CONFIG_DIR)
})
afterEach(() => {
  delete process.env.CLAUDE_CONFIG_DIR
  rmSync(dir, { recursive: true, force: true })
})

test('heavy directories are found without any external tool and nested ones too', () => {
  const target = join(project, 'crates', 'app', 'target')
  mkdirSync(target, { recursive: true })
  writeFileSync(join(target, 'blob'), Buffer.alloc(5000))
  mkdirSync(join(project, 'dist'))
  writeFileSync(join(project, 'dist', 'small'), 'x')
  const snapshot = collect(project, { heavyBytes: 1000 })
  assert.deepEqual(snapshot.heavyDirs.map((d) => [d.name, d.path]), [['target', 'crates/app/target']])
})

test('node_modules and .git are never walked', () => {
  mkdirSync(join(project, 'node_modules', 'pkg', 'dist'), { recursive: true })
  writeFileSync(join(project, 'node_modules', 'pkg', 'dist', 'big'), Buffer.alloc(5000))
  assert.deepEqual(collect(project, { heavyBytes: 1000 }).heavyDirs, [])
})

test('agents, skills and instruction files are read from user and project folders', () => {
  mkdirSync(join(process.env.CLAUDE_CONFIG_DIR, 'agents'))
  writeFileSync(join(process.env.CLAUDE_CONFIG_DIR, 'agents', 'a.md'), '---\nname: scout\nmodel: haiku\n---\nbody\n')
  writeFileSync(join(process.env.CLAUDE_CONFIG_DIR, 'agents', 'b.md'), '---\nname: thinker\n---\nbody\n')
  mkdirSync(join(process.env.CLAUDE_CONFIG_DIR, 'skills', 'quiet'), { recursive: true })
  writeFileSync(join(process.env.CLAUDE_CONFIG_DIR, 'skills', 'quiet', 'SKILL.md'), '---\nname: quiet\ndisable-model-invocation: true\n---\n')
  mkdirSync(join(project, '.claude', 'skills', 'loud'), { recursive: true })
  writeFileSync(join(project, '.claude', 'skills', 'loud', 'SKILL.md'), '---\nname: loud\ndescription: d\n---\n')
  writeFileSync(join(project, 'CLAUDE.md'), '@NOTES.md\n\n# Compact instructions\nkeep x\n')
  writeFileSync(join(project, 'NOTES.md'), 'a\nb\n')

  const s = collect(project)
  assert.deepEqual(s.agents.user.map((a) => [a.name, a.model]).sort(), [['scout', 'haiku'], ['thinker', null]])
  assert.deepEqual([s.skills.total, s.skills.autoLoaded], [2, 1])
  assert.deepEqual(s.instructionFiles.map((f) => [f.path, f.compactInstructions]), [['CLAUDE.md', true], ['NOTES.md', false]])
})

test('a settings file that does not parse is reported, a missing one is not', () => {
  mkdirSync(join(project, '.claude'))
  writeFileSync(join(project, '.claude', 'settings.local.json'), '{ nope')
  const s = collect(project)
  assert.equal(s.unreadable.length, 1)
  assert.match(s.unreadable[0], /settings\.local\.json$/)
})

test('settings env blocks are merged over the process environment', () => {
  writeFileSync(join(process.env.CLAUDE_CONFIG_DIR, 'settings.json'), JSON.stringify({ env: { MAX_THINKING_TOKENS: '5' } }))
  assert.equal(collect(project).env.MAX_THINKING_TOKENS, '5')
})

test('large lockfiles are listed and small ones are not', () => {
  writeFileSync(join(project, 'bun.lock'), Buffer.alloc(300000))
  writeFileSync(join(project, 'yarn.lock'), 'tiny')
  assert.deepEqual(collect(project).lockfiles.map((l) => l.name), ['bun.lock'])
})
