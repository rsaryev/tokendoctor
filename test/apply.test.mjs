import assert from 'node:assert/strict'
import { existsSync, mkdirSync, statSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { applyOps, describePlan, diffLines, planFix, writePlan } from '../lib/apply.mjs'

let dir
let project
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'token-doctor-'))
  project = join(dir, 'project')
  mkdirSync(project)
  process.env.CLAUDE_CONFIG_DIR = join(dir, 'config')
  mkdirSync(process.env.CLAUDE_CONFIG_DIR)
})
afterEach(() => {
  delete process.env.CLAUDE_CONFIG_DIR
  rmSync(dir, { recursive: true, force: true })
})

test('set, unset and add leave the input untouched and keep other keys', () => {
  const before = { a: 1, env: { X: '1' }, permissions: { deny: ['Read(a)'] } }
  const after = applyOps(before, [
    { op: 'set', key: 'env.Y', value: '2' },
    { op: 'unset', key: 'a' },
    { op: 'add', key: 'permissions.deny', values: ['Read(a)', 'Read(b)'] },
  ])
  assert.deepEqual(after, { env: { X: '1', Y: '2' }, permissions: { deny: ['Read(a)', 'Read(b)'] } })
  assert.deepEqual(before, { a: 1, env: { X: '1' }, permissions: { deny: ['Read(a)'] } })
})

test('add creates missing parents and a missing array', () => {
  assert.deepEqual(applyOps({}, [{ op: 'add', key: 'permissions.deny', values: ['Read(x)'] }]), {
    permissions: { deny: ['Read(x)'] },
  })
})

test('the diff lists only changed lines', () => {
  const diff = diffLines('{\n  "a": 1\n}\n', '{\n  "a": 1,\n  "b": 2\n}\n')
  assert.match(diff, /^-\s+"a": 1$/m)
  assert.match(diff, /^\+\s+"a": 1,$/m)
  assert.match(diff, /^\+\s+"b": 2$/m)
})

test('a settings fix backs the old file up and writes the new one', () => {
  const path = join(project, '.claude', 'settings.json')
  mkdirSync(join(project, '.claude'))
  writeFileSync(path, '{\n  "model": "sonnet"\n}\n')
  const plan = planFix({ scope: 'project', ops: [{ op: 'set', key: 'autoCompactWindow', value: 300000 }] }, project)
  assert.match(describePlan(plan), /autoCompactWindow/)
  assert.equal(readFileSync(path, 'utf8'), '{\n  "model": "sonnet"\n}\n', 'planning writes nothing')
  const result = writePlan(plan, new Date('2026-01-02T03:04:05Z'))
  assert.equal(result.written, true)
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), { model: 'sonnet', autoCompactWindow: 300000 })
  assert.equal(readFileSync(result.backup, 'utf8'), '{\n  "model": "sonnet"\n}\n')
  assert.match(result.backup, /settings\.json\.token-doctor-2026-01-02T03-04-05-000Z\.bak$/)
})

test('a fix for a file that does not exist creates it without a backup', () => {
  const plan = planFix({ scope: 'user', ops: [{ op: 'set', key: 'autoCompactWindow', value: 300000 }] }, project)
  assert.equal(plan.exists, false)
  const result = writePlan(plan)
  assert.equal(result.backup, null)
  assert.ok(existsSync(join(process.env.CLAUDE_CONFIG_DIR, 'settings.json')))
})

test('a fix that changes nothing writes nothing', () => {
  const path = join(project, '.claude', 'settings.json')
  mkdirSync(join(project, '.claude'))
  writeFileSync(path, '{\n  "autoCompactWindow": 300000\n}\n')
  const plan = planFix({ scope: 'project', ops: [{ op: 'set', key: 'autoCompactWindow', value: 300000 }] }, project)
  assert.deepEqual(writePlan(plan), { written: false, reason: 'no change' })
  assert.deepEqual(readdirSync(join(project, '.claude')), ['settings.json'])
})

test('a template is copied once and never overwrites an existing agent', () => {
  const plan = planFix({ scope: 'project', template: 'Explore' }, project)
  assert.equal(writePlan(plan).written, true)
  const target = join(project, '.claude', 'agents', 'Explore.md')
  assert.match(readFileSync(target, 'utf8'), /^---\nname: Explore\n/)
  writeFileSync(target, 'mine')
  const again = planFix({ scope: 'project', template: 'Explore' }, project)
  assert.match(describePlan(again), /already exists/)
  assert.deepEqual(writePlan(again), { written: false, reason: 'exists' })
  assert.equal(readFileSync(target, 'utf8'), 'mine')
})

test('the scope can be overridden', () => {
  const plan = planFix({ scope: 'user', ops: [{ op: 'set', key: 'a', value: 1 }] }, project, 'local')
  assert.equal(plan.path, join(project, '.claude', 'settings.local.json'))
})

test('every shipped template has the frontmatter Claude Code needs', () => {
  for (const name of ['Explore', 'test-runner', 'docs-lookup']) {
    const plan = planFix({ scope: 'project', template: name }, project)
    const text = readFileSync(plan.source, 'utf8')
    assert.match(text, new RegExp(`^---\\nname: ${name}\\ndescription: .+\\n`), name)
    assert.match(text, /^model: haiku$/m, name)
    assert.match(text, /^omitClaudeMd: true$/m, name)
  }
})

test('the diff of a compact one-line file shows only the real change and notes the re-indent', () => {
  const path = join(project, '.claude', 'settings.json')
  mkdirSync(join(project, '.claude'))
  writeFileSync(path, '{ "env": { "A": "1" }, "model": "sonnet" }\n')
  const plan = planFix({ scope: 'project', ops: [{ op: 'set', key: 'autoCompactWindow', value: 300000 }] }, project)
  const text = describePlan(plan)
  assert.match(text, /^\+\s+"autoCompactWindow": 300000$/m)
  assert.doesNotMatch(text, /^-\s+"env"/m)
  assert.match(text, /re-indented/)
})

test('an already-normalised file gets no re-indent note', () => {
  const path = join(project, '.claude', 'settings.json')
  mkdirSync(join(project, '.claude'))
  writeFileSync(path, '{\n  "model": "sonnet"\n}\n')
  const plan = planFix({ scope: 'project', ops: [{ op: 'set', key: 'x', value: 1 }] }, project)
  assert.doesNotMatch(describePlan(plan), /re-indented/)
})

test('dropHooks removes only the matching entries and empties no event it did not touch', () => {
  const before = {
    hooks: {
      PreToolUse: [{ matcher: '*', hooks: [1] }, { matcher: 'Bash', hooks: [2] }],
      PostToolUse: [{ matcher: '*', hooks: [3] }],
      Stop: [{ hooks: [4] }],
    },
  }
  const after = applyOps(before, [{ op: 'dropHooks', matcher: '*' }])
  assert.deepEqual(after.hooks, { PreToolUse: [{ matcher: 'Bash', hooks: [2] }], Stop: [{ hooks: [4] }] })
  assert.equal(before.hooks.PostToolUse.length, 1, 'the input is untouched')
  assert.deepEqual(applyOps({ model: 'x' }, [{ op: 'dropHooks', matcher: '*' }]), { model: 'x' })
})

test('the status line script is installed once, executable, and never overwritten', () => {
  const plan = planFix({ scope: 'user', script: 'statusline.sh' }, project)
  assert.equal(plan.kind, 'script')
  assert.equal(plan.path, join(process.env.CLAUDE_CONFIG_DIR, 'token-doctor-statusline.sh'))
  assert.equal(writePlan(plan).written, true)
  assert.ok((statSync(plan.path).mode & 0o111) !== 0, 'executable')
  assert.match(readFileSync(plan.path, 'utf8'), /^#!\/bin\/bash/)
  writeFileSync(plan.path, 'mine')
  const again = planFix({ scope: 'user', script: 'statusline.sh' }, project)
  assert.match(describePlan(again), /already exists/)
  assert.deepEqual(writePlan(again), { written: false, reason: 'exists' })
  assert.equal(readFileSync(plan.path, 'utf8'), 'mine')
})

test('a hook drop is described by what is removed, not by stray lines of JSON', () => {
  const path = join(project, '.claude', 'settings.json')
  mkdirSync(join(project, '.claude'))
  writeFileSync(
    path,
    JSON.stringify({
      hooks: {
        PreToolUse: [
          { matcher: '*', hooks: [{ type: 'command', command: '/bin/sh orca.sh' }] },
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'keep.sh' }] },
        ],
        PermissionRequest: [{ matcher: '*', hooks: [{ type: 'command', command: '/bin/sh orca.sh' }] }],
        Stop: [{ hooks: [{ type: 'command', command: 'stop.sh' }] }],
      },
    }),
  )
  const text = describePlan(planFix({ scope: 'project', ops: [{ op: 'dropHooks', matcher: '*' }] }, project))
  assert.match(text, /remove 1 "\*" hook from PreToolUse: \/bin\/sh orca\.sh/)
  assert.match(text, /remove 1 "\*" hook from PermissionRequest: \/bin\/sh orca\.sh/)
  assert.doesNotMatch(text, /keep\.sh|stop\.sh/, 'what stays is not listed')
  assert.doesNotMatch(text, /^- /m, 'no raw line diff')
})
