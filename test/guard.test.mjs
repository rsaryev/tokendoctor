import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blockedNote, dropInSettings, guardState, ORG_ID, orgPaths } from '../lib/guard.mjs'

const team = { organizationType: 'claude_team' }
const installed = (platform = 'darwin') => dropInSettings(platform)

test('no guard on a personal plan without managed settings: the slide runs', () => {
  const s = guardState({ account: { organizationType: 'claude_max' }, platform: 'darwin' })
  assert.equal(s.seated, false)
  assert.equal(s.slideRuns, true)
  assert.equal(blockedNote(s), null)
})

test('a Team login seats the guard and blocks the slide of the copy a person installed', () => {
  const s = guardState({ account: team, platform: 'darwin', root: '~/.claude/plugins/cache/tokendoctor' })
  assert.equal(s.seated, true)
  assert.equal(s.slideRuns, false)
  assert.match(blockedNote(s), /Team plan.*tokendoctor-org-install/s)
})

test('an API key or a cloud provider is not a /login, so a Team account alone seats nothing', () => {
  assert.equal(guardState({ account: team, env: { ANTHROPIC_API_KEY: 'x' } }).seated, false)
  assert.equal(guardState({ account: team, env: { CLAUDE_CODE_USE_BEDROCK: '1' } }).seated, false)
})

test('managed settings seat the guard whatever the login', () => {
  const s = guardState({ managed: { permissions: { deny: ['Bash(rm *)'] } } })
  assert.deepEqual(s.reasons, ['this machine has managed settings'])
})

test('the machine copy runs the slide; the person’s copy still does not until it is the one loaded', () => {
  const managed = installed()
  const paths = orgPaths('darwin')
  const org = guardState({ account: team, managed, platform: 'darwin', root: paths.plugin })
  assert.equal(org.orgInstalled, true)
  assert.equal(org.runningOrgCopy, true)
  assert.equal(org.slideRuns, true)
  const user = guardState({ account: team, managed, platform: 'darwin', root: '/elsewhere/tokendoctor' })
  assert.equal(user.slideRuns, false)
  assert.match(blockedNote(user), /restart Claude Code/)
  // From a shell (no root known), an installed copy is taken to be the one that runs.
  assert.equal(guardState({ account: team, managed, platform: 'darwin' }).slideRuns, true)
})

test('server-managed settings or an MDM profile hide the drop-in: only an administrator can help', () => {
  const s = guardState({ account: team, managed: installed(), remote: { permissions: {} }, platform: 'darwin' })
  assert.equal(s.filesHidden, true)
  assert.equal(s.orgInstalled, false)
  assert.match(blockedNote(s), /administrator/)
  const merged = guardState({ account: team, managed: installed(), remote: { permissions: {}, managedSourcesBehavior: 'merge' }, platform: 'darwin' })
  assert.equal(merged.filesHidden, false)
})

test('the drop-in lists the machine copy after the guard and loads it in place', () => {
  const d = dropInSettings('linux')
  assert.deepEqual(d.appendPlugins, [ORG_ID])
  assert.equal(d.enabledPlugins[ORG_ID], true)
  assert.deepEqual(d.extraKnownMarketplaces['tokendoctor-org'].source, { source: 'directory', path: '/etc/claude-code/tokendoctor-org' })
  assert.equal(d.prependPlugins, undefined, 'prependPlugins would replace the default list and could drop the guard')
})
