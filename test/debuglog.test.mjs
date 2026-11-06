import assert from 'node:assert/strict'
import { test } from 'node:test'
import { debugFindings, parseDebugLog } from '../lib/debuglog.mjs'

const at = '2026-11-06T01:26:35.308Z [DEBUG] '
const lines = (...xs) => xs.map((x) => (x.startsWith('2026') ? x : at + x)).join('\n')

const SEATED = 'cc-plugin-sec-default@builtin seated outermost: this machine has managed settings'
const GUARD = 'hooks module cc-plugin-sec-default@builtin loaded (native, environment 1, tier prepend); events: classic.*,session.compact,settings.read'
const AGENTS = 'hooks module cc-plugin-agents-md@builtin loaded (native, environment 4, tier builtin); events: session.start,session.compact'
const ORG = 'hooks module tokendoctor@tokendoctor-org loaded (worker, environment 3, tier append); events: tool.call,session.start,session.compact'
const USER = 'hooks module tokendoctor@tokendoctor loaded (worker, environment 1, tier user); events: tool.call,session.start,session.compact'

test('the log is read into tiers, events, the guard and the window', () => {
  const log = parseDebugLog(lines(SEATED, GUARD, ORG, AGENTS, 'autocompact: tokens=[REDACTED] level=ok effectiveWindow=480000', 'User-Agent: claude-code/2.1.318 (sdk-cli)'))
  assert.deepEqual(log.guard, { seated: true, reason: 'this machine has managed settings' })
  assert.equal(log.modules.find((m) => m.id === 'tokendoctor@tokendoctor-org').tier, 'append')
  assert.equal(log.effectiveWindow, 480000)
  assert.equal(log.version, '2.1.318')
  assert.deepEqual(debugFindings(log, { slideOn: true }), [])
})

test('the slide behind a seated guard is seen in the log', () => {
  const f = debugFindings(parseDebugLog(lines(SEATED, GUARD, USER)), { slideOn: true })
  assert.deepEqual(f.map((x) => x.id), ['slide-behind-guard'])
})

test('no tokendoctor module is an error; another user mod on compaction is noted', () => {
  assert.equal(debugFindings(parseDebugLog(lines(GUARD)))[0].id, 'tokendoctor-not-loaded')
  const other = 'hooks module handoff@x loaded (worker, environment 2, tier user); events: session.compact'
  const f = debugFindings(parseDebugLog(lines(other, USER)), { slideOn: true })
  assert.deepEqual(f.map((x) => x.id), ['compact-hooks-ahead'])
})

test('skipped hooks, a machine copy that is not the organization’s and an over-budget skill listing', () => {
  const log = parseDebugLog(lines(
    ORG,
    'tokendoctor: session.compact hook skipped: threw Error: boom',
    'tokendoctor@tokendoctor-org is enabled by managed settings, but its marketplace is not a directory',
    '2026-11-06T01:26:35.308Z [WARN] Skill listing over budget: 75 skills, 30414 chars > 30000 budget — descriptions will be truncated',
    'Loaded 37 skills from plugin vercel default directory',
  ))
  const ids = debugFindings(log, { slideOn: true }).map((x) => x.id)
  assert.deepEqual(ids.sort(), ['mod-hooks-skipped', 'org-copy-not-org', 'skill-listing-over-budget'])
  const skill = debugFindings(log).find((x) => x.id === 'skill-listing-over-budget')
  assert.match(skill.detail, /vercel \(37\)/)
})
