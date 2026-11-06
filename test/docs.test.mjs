import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { docsIndex, loadDocs, parseEnvVars, parseSettingsKeys } from '../lib/docs.mjs'
import { runRules } from '../lib/rules.mjs'

const SETTINGS = `# Settings reference

### \`autoCompactWindow\`

Set the auto-compact window. Requires Claude Code v2.1.288 or later.

### \`idleCompaction\`

Idle compaction compacts a long conversation.

The row requires Claude Code v2.1.302 or later. Requires Claude Code v2.1.400 or later.

### \`futureKey\`

Something new. Requires Claude Code v9.0.0 or later.
`
const ENV = `| Variable | Purpose |
| :- | :- |
| \`CLAUDE_CODE_AUTO_COMPACT_WINDOW\` | Set the window, from \`100000\`. Suffixed values require v2.1.304 or later |
| \`CLAUDE_CODE_FUTURE\` | New. Requires Claude Code v9.0.0 or later |
`

test('settings keys come with the release their first paragraph names, not a later one', () => {
  const keys = parseSettingsKeys(SETTINGS)
  assert.equal(keys.get('autoCompactWindow'), '2.1.288')
  assert.equal(keys.get('idleCompaction'), null, 'only the first paragraph dates the key')
  assert.equal(keys.get('futureKey'), '9.0.0')
})

test('environment variables come with the release a row requires up front', () => {
  const vars = parseEnvVars(ENV)
  assert.equal(vars.get('CLAUDE_CODE_AUTO_COMPACT_WINDOW'), null, '"require v…" of a sub-feature does not date the variable')
  assert.equal(vars.get('CLAUDE_CODE_FUTURE'), '9.0.0')
})

const snapshot = (settings) => ({
  version: '2.1.318', project: '/p', settings: { user: settings, project: {}, local: {} }, env: {}, unreadable: [],
  agents: { user: [], project: [] }, instructionFiles: [], skills: { total: 0, autoLoaded: 0, names: [] }, userSkillNames: [], projectSkillNames: [],
  enabledPlugins: 0, enabledPluginNames: [], languageMarkers: [], mcpServers: 0, heavyDirs: [], lockfiles: [],
  docs: docsIndex({ 'settings-reference': SETTINGS, 'env-vars': ENV }),
})
const find = (s, id) => runRules(s).find((f) => f.id === id)

test('a key the docs do not have is flagged; $schema is not', () => {
  const f = find(snapshot({ $schema: 'x', autoCompactWindw: 400000 }), 'settings-key-undocumented')
  assert.match(f.detail, /autoCompactWindw \(user\)/)
  assert.doesNotMatch(f.detail, /\$schema/)
})

test('only variables of Claude Code’s own families are checked against the docs', () => {
  const f = find(snapshot({ env: { CLAUDE_CODE_AUTO_COMPACT_WINDOWS: '400000', MY_TOOL_TOKEN: 'x' } }), 'env-undocumented')
  assert.match(f.detail, /CLAUDE_CODE_AUTO_COMPACT_WINDOWS/)
  assert.doesNotMatch(f.detail, /MY_TOOL_TOKEN/)
})

test('a key newer than the installed release is flagged', () => {
  const f = find(snapshot({ futureKey: true, env: { CLAUDE_CODE_FUTURE: '1' } }), 'setting-needs-newer-version')
  assert.match(f.detail, /futureKey \(needs 9\.0\.0\).*CLAUDE_CODE_FUTURE/)
})

test('without docs the doc checks say nothing', () => {
  const s = snapshot({ autoCompactWindw: 1 })
  s.docs = null
  assert.equal(find(s, 'settings-key-undocumented'), undefined)
})

test('pages are fetched once a day and read from the cache offline, however old', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'td-docs-'))
  let fetched = 0
  const fetchPage = async (url) => (fetched++, url.endsWith('env-vars.md') ? ENV : SETTINGS)
  const now = Date.now()
  await loadDocs(dir, { fetchPage, now })
  assert.equal(fetched, 2)
  await loadDocs(dir, { fetchPage, now: now + 3600e3 })
  assert.equal(fetched, 2, 'fresh cache: no fetch')
  for (const f of ['env-vars.md', 'settings-reference.md']) utimesSync(join(dir, f), new Date(now - 3 * 86400e3), new Date(now - 3 * 86400e3))
  const offline = await loadDocs(dir, { fetchPage, offline: true, now })
  assert.equal(fetched, 2)
  assert.equal(offline.stale, true)
  const failing = await loadDocs(dir, { fetchPage: async () => { throw new Error('offline') }, now })
  assert.equal(failing.stale, true, 'a failed fetch falls back to the old copy')
  assert.equal(failing.pages['env-vars'], readFileSync(join(dir, 'env-vars.md'), 'utf8'))
})
