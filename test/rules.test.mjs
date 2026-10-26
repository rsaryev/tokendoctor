import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareVersions, modelFamily, ruleIds, runRules } from '../lib/rules.mjs'

// A configuration that triggers no rule: each test changes one thing and expects one finding.
function clean(overrides = {}) {
  return {
    version: '2.1.310',
    project: '/p',
    settings: {
      user: { model: 'sonnet', autoCompactWindow: 300000, statusLine: { type: 'command' } },
      project: {},
      local: {},
    },
    env: { CLAUDE_CODE_SUBAGENT_MODEL: 'sonnet' },
    unreadable: [],
    agents: { user: [{ name: 'Explore', model: 'haiku' }], project: [] },
    instructionFiles: [{ path: 'CLAUDE.md', lines: 40, compactInstructions: true }],
    skills: { total: 3, autoLoaded: 3, names: [] },
    userSkillNames: [],
    projectSkillNames: [],
    enabledPlugins: 2,
    enabledPluginNames: [],
    languageMarkers: [],
    mcpServers: 1,
    heavyDirs: [],
    lockfiles: [],
    ...overrides,
  }
}

const ids = (snapshot) => runRules(snapshot).map((f) => f.id)
const only = (snapshot, id) => runRules(snapshot).find((f) => f.id === id)

test('a tuned configuration produces no findings', () => {
  assert.deepEqual(runRules(clean()), [])
})

test('compare versions numerically', () => {
  assert.ok(compareVersions('2.1.310', '2.1.99') > 0)
  assert.ok(compareVersions('2.1.251', '2.1.251') === 0)
  assert.ok(compareVersions('2.0.9', '2.1.0') < 0)
})

test('model family is read from aliases and full ids', () => {
  assert.equal(modelFamily('claude-opus-5-5'), 'opus')
  assert.equal(modelFamily('sonnet[1m]'), 'sonnet')
  assert.equal(modelFamily('something-else'), null)
})

test('unset compact window warns and offers a user-level fix', () => {
  const s = clean()
  delete s.settings.user.autoCompactWindow
  const f = only(s, 'compact-window-unset')
  assert.equal(f.severity, 'warn')
  assert.deepEqual(f.fixes[0].ops[0], { op: 'set', key: 'autoCompactWindow', value: 400000 })
})

test('a window set in modelSettings, the env var or settings counts as set', () => {
  const a = clean()
  delete a.settings.user.autoCompactWindow
  a.settings.user.modelSettings = { 'claude-sonnet-5-5': { autoCompactWindow: 300000 } }
  assert.ok(!ids(a).includes('compact-window-unset'))
  const b = clean()
  delete b.settings.user.autoCompactWindow
  b.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = '300k'
  assert.ok(!ids(b).includes('compact-window-unset'))
})

test('compact window rules are skipped on versions that predate the setting', () => {
  const s = clean({ version: '2.1.200' })
  delete s.settings.user.autoCompactWindow
  assert.ok(!ids(s).includes('compact-window-unset'))
})

test('the undocumented autoCompactThreshold is an error with one unset fix per scope', () => {
  const s = clean()
  s.settings.user.autoCompactThreshold = 0.5
  s.settings.project.autoCompactThreshold = 0.5
  const f = only(s, 'compact-threshold-undocumented')
  assert.equal(f.severity, 'error')
  assert.deepEqual(f.fixes.map((x) => x.scope), ['user', 'project'])
})

test('a bare compact-window variable under 100000 is an error, a suffixed one is not', () => {
  const bad = clean()
  bad.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = '200'
  assert.equal(only(bad, 'compact-env-bare-number').severity, 'error')
  const good = clean()
  good.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = '200k'
  assert.ok(!ids(good).includes('compact-env-bare-number'))
})

test('a tiny compact window warns', () => {
  const s = clean()
  s.settings.user.autoCompactWindow = 100000
  assert.equal(only(s, 'compact-window-small').severity, 'warn')
})

test('explore override is detected at user or project level', () => {
  const s = clean({ agents: { user: [], project: [] } })
  s.settings.user.model = 'opus'
  assert.ok(ids(s).includes('explore-default-model'))
  assert.equal(only(s, 'explore-default-model').fixes[0].template, 'Explore')
  const p = clean({ agents: { user: [], project: [{ name: 'Explore', model: 'haiku' }] } })
  p.settings.user.model = 'opus'
  assert.ok(!ids(p).includes('explore-default-model'))
})

test('the built-in Explore inherits a Sonnet or Haiku main model, so it is not flagged there', () => {
  const s = clean({ agents: { user: [], project: [] } })
  assert.ok(!ids(s).includes('explore-default-model'))
  delete s.settings.user.model
  assert.ok(ids(s).includes('explore-default-model'))
})

test('user-level effortLevel is reported as not reaching Opus 5.5', () => {
  const s = clean()
  s.settings.user.effortLevel = 'low'
  assert.match(only(s, 'effort-user-key-ignored').detail, /"low"/)
  const p = clean()
  p.settings.project.effortLevel = 'low'
  assert.ok(!ids(p).includes('effort-user-key-ignored'))
})

test('a saved effort above the model default is reported with an unset fix', () => {
  const s = clean()
  s.settings.user.modelSettings = {
    'claude-opus-5-5': { effortLevel: 'xhigh' },
    'claude-opus-5': { effortLevel: 'high' },
    'claude-sonnet-5-5': { effortLevel: 'medium' },
  }
  const f = only(s, 'effort-above-default')
  assert.match(f.detail, /claude-opus-5-5: xhigh \(default medium\)/)
  assert.doesNotMatch(f.detail, /claude-opus-5:|sonnet/)
  assert.deepEqual(f.fixes, [{ scope: 'user', ops: [{ op: 'unset', key: 'modelSettings.claude-opus-5-5.effortLevel' }] }])
})

test('the advisor rank check is left to aliases, whose versions follow the family order', () => {
  const s = clean()
  s.settings.user.model = 'opus'
  s.settings.user.advisorModel = 'sonnet'
  assert.match(only(s, 'advisor-inactive').detail, /ranks below/)
  s.settings.user.model = 'claude-opus-4-8'
  assert.ok(!ids(s).includes('advisor-inactive'))
})

test('forcing one subagent model warns and names the model', () => {
  const s = clean()
  s.env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE = '1'
  const f = only(s, 'subagent-model-force')
  assert.equal(f.severity, 'warn')
  assert.match(f.detail, /sonnet/)
})

test('subagent model hint appears only when the main model is expensive and nothing is set', () => {
  const s = clean()
  s.settings.user.model = 'opus'
  delete s.env.CLAUDE_CODE_SUBAGENT_MODEL
  assert.ok(ids(s).includes('subagent-model-unset'))
  s.settings.user.model = 'sonnet'
  assert.ok(!ids(s).includes('subagent-model-unset'))
})

test('thinking budget variable and max effort in settings are flagged', () => {
  const s = clean()
  s.env.MAX_THINKING_TOKENS = '8000'
  s.settings.project.effortLevel = 'max'
  assert.ok(ids(s).includes('thinking-tokens-env'))
  const f = only(s, 'effort-max-in-settings')
  assert.deepEqual(f.fixes[0], { scope: 'project', ops: [{ op: 'set', key: 'effortLevel', value: 'xhigh' }] })
  s.env.MAX_THINKING_TOKENS = '0'
  assert.ok(!ids(s).includes('thinking-tokens-env'))
})

test('an advisor that cannot run is reported with the reason', () => {
  const telemetry = clean()
  telemetry.settings.user.advisorModel = 'opus'
  telemetry.env.DISABLE_TELEMETRY = '1'
  assert.match(only(telemetry, 'advisor-inactive').detail, /DISABLE_TELEMETRY/)

  const below = clean()
  below.settings.user.model = 'opus'
  below.settings.user.advisorModel = 'sonnet'
  assert.match(only(below, 'advisor-inactive').detail, /ranks below/)

  const ok = clean()
  ok.settings.user.advisorModel = 'opus'
  assert.ok(!ids(ok).includes('advisor-inactive'))
})

test('long instruction files and a missing compact section are flagged', () => {
  const long = clean({ instructionFiles: [{ path: 'AGENTS.md', lines: 300, compactInstructions: true }] })
  assert.match(only(long, 'instructions-long').detail, /AGENTS.md: 300 lines/)
  const none = clean({ instructionFiles: [{ path: 'CLAUDE.md', lines: 20, compactInstructions: false }] })
  assert.ok(ids(none).includes('compact-instructions-missing'))
  assert.ok(!ids(clean({ instructionFiles: [] })).includes('compact-instructions-missing'))
})

test('a large always-on surface lists what is large', () => {
  const s = clean({ skills: { total: 30, autoLoaded: 30, names: [] }, enabledPlugins: 9, mcpServers: 7 })
  const f = only(s, 'context-surface')
  assert.match(f.detail, /30 skills/)
  assert.match(f.detail, /9 enabled plugins/)
  assert.match(f.detail, /7 MCP servers/)
})

test('heavy directories not covered by a Read deny rule get a project fix', () => {
  const s = clean({ heavyDirs: [{ name: 'target', path: 'src-tauri/target', bytes: 39e9 }] })
  const f = only(s, 'heavy-dirs-not-denied')
  assert.deepEqual(f.fixes[0].ops[0], { op: 'add', key: 'permissions.deny', values: ['Read(./**/target/**)'] })
  s.settings.project.permissions = { deny: ['Read(./**/target/**)'] }
  assert.ok(!ids(s).includes('heavy-dirs-not-denied'))
})

test('large lockfiles are flagged until denied', () => {
  const s = clean({ lockfiles: [{ name: 'bun.lock', bytes: 500000 }] })
  assert.equal(only(s, 'large-lockfile-readable').fixes[0].ops[0].values[0], 'Read(./bun.lock)')
  s.settings.project.permissions = { deny: ['Read(./bun.lock)'] }
  assert.ok(!ids(s).includes('large-lockfile-readable'))
})

test('hooks matching every tool call are counted', () => {
  const s = clean()
  s.settings.user.hooks = {
    PreToolUse: [{ matcher: '*', hooks: [] }, { matcher: 'Bash', hooks: [] }],
    PostToolUse: [{ matcher: '*', hooks: [] }],
  }
  assert.match(only(s, 'every-tool-hooks').detail, /^2 /)
})

test('an unreadable settings file is an error', () => {
  const f = only(clean({ unreadable: ['~/.claude/settings.json'] }), 'settings-unreadable')
  assert.equal(f.severity, 'error')
})

test('cache and team variables are flagged', () => {
  const s = clean()
  s.env.DISABLE_PROMPT_CACHING = '1'
  s.env.FORCE_PROMPT_CACHING_5M = '1'
  s.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1'
  s.env.MAX_MCP_OUTPUT_TOKENS = '150000'
  assert.equal(only(s, 'prompt-caching-disabled').severity, 'warn')
  for (const id of ['prompt-cache-ttl-forced-short', 'agent-teams-enabled', 'mcp-output-limit-raised']) {
    assert.ok(ids(s).includes(id), id)
  }
  assert.ok(!ids({ ...clean(), env: { ...clean().env, DISABLE_PROMPT_CACHING: '0' } }).includes('prompt-caching-disabled'))
})

test('an expensive default model, inheriting agents, duplicate skills', () => {
  const s = clean({
    agents: { user: [{ name: 'Explore', model: 'haiku' }, { name: 'reviewer', model: null }], project: [] },
    userSkillNames: ['a', 'b'],
    projectSkillNames: ['b'],
  })
  s.settings.user.model = 'claude-opus-5-5'
  delete s.settings.user.statusLine
  assert.match(only(s, 'main-model-expensive').title, /claude-opus-5-5/)
  assert.match(only(s, 'agents-inherit-model').detail, /reviewer/)
  assert.match(only(s, 'duplicate-skills').detail, /^b\./)
  assert.ok(ids(s).includes('no-statusline'))
})

test('findings are ordered errors, warnings, info and every rule has a unique id', () => {
  const s = clean({ unreadable: ['x'], lockfiles: [{ name: 'bun.lock', bytes: 9e5 }] })
  s.settings.user.autoCompactThreshold = 0.5
  s.settings.user.autoCompactWindow = 100000
  const sev = runRules(s).map((f) => f.severity)
  assert.deepEqual(sev, [...sev].sort((a, b) => ({ error: 0, warn: 1, info: 2 })[a] - ({ error: 0, warn: 1, info: 2 })[b]))
  assert.equal(new Set(ruleIds).size, ruleIds.length)
})

test('every finding carries a documentation link', () => {
  const s = clean({ unreadable: ['x'], lockfiles: [{ name: 'bun.lock', bytes: 9e5 }], heavyDirs: [{ name: 'dist', path: 'dist', bytes: 2e8 }] })
  s.settings.user.autoCompactThreshold = 1
  s.env.DISABLE_PROMPT_CACHING = '1'
  for (const f of runRules(s)) assert.match(f.doc, /^https:\/\//, f.id)
})

test('fast mode saved as a default is flagged and a per-session opt-in fixes it', () => {
  const s = clean()
  s.settings.user.fastMode = true
  const f = only(s, 'fast-mode-enabled')
  assert.equal(f.severity, 'warn')
  assert.deepEqual(f.fixes[0], { scope: 'user', ops: [{ op: 'set', key: 'fastModePerSessionOptIn', value: true }] })
  s.settings.user.fastModePerSessionOptIn = true
  assert.ok(!ids(s).includes('fast-mode-enabled'))
  assert.ok(!ids(clean()).includes('fast-mode-enabled'))
})

test('a typed project without its language server plugin is pointed at the plugin', () => {
  const s = clean({ languageMarkers: ['typescript-lsp', 'gopls-lsp'] })
  const f = only(s, 'code-intelligence-missing')
  assert.match(f.detail, /typescript-lsp@claude-plugins-official/)
  assert.match(f.detail, /gopls-lsp@claude-plugins-official/)
  assert.equal(f.fixes, undefined)
  s.enabledPluginNames = ['typescript-lsp@claude-plugins-official', 'gopls-lsp@claude-plugins-official']
  assert.ok(!ids(s).includes('code-intelligence-missing'))
})

test('every-tool hooks on any tool event are counted and each scope gets a drop fix', () => {
  const s = clean()
  s.settings.user.hooks = {
    PreToolUse: [{ matcher: '*', hooks: [] }, { matcher: 'Bash', hooks: [] }],
    PostToolUseFailure: [{ matcher: '*', hooks: [] }],
    PermissionRequest: [{ matcher: '*', hooks: [] }],
    Stop: [{ hooks: [] }],
  }
  s.settings.project.hooks = { PostToolUse: [{ matcher: '*', hooks: [] }] }
  const f = only(s, 'every-tool-hooks')
  assert.match(f.detail, /^4 /)
  assert.deepEqual(
    f.fixes.map((x) => x.scope),
    ['user', 'project'],
  )
  assert.deepEqual(f.fixes[0].ops, [{ op: 'dropHooks', matcher: '*' }])
})

test('long instructions name the mechanisms that do cut context, and imports are not one of them', () => {
  const f = only(clean({ instructionFiles: [{ path: 'CLAUDE.md', lines: 300, compactInstructions: true }] }), 'instructions-long')
  assert.match(f.detail, /paths/)
  assert.match(f.detail, /imports? .*do(es)? not/i)
})

test('the context-surface advice says MCP tool definitions are deferred', () => {
  const f = only(clean({ mcpServers: 9 }), 'context-surface')
  assert.match(f.detail, /deferred/)
})

test('a missing status line is fixed by installing the script and pointing statusLine at it', () => {
  const s = clean()
  delete s.settings.user.statusLine
  const f = only(s, 'no-statusline')
  assert.deepEqual(f.fixes[0], { scope: 'user', script: 'statusline.sh' })
  assert.equal(f.fixes[1].scope, 'user')
  assert.equal(f.fixes[1].ops[0].key, 'statusLine')
  assert.equal(f.fixes[1].ops[0].value.type, 'command')
  assert.match(f.fixes[1].ops[0].value.command, /tokendoctor-statusline\.sh$/)
  assert.match(f.detail, /jq/)
  assert.match(f.detail, /token-weather/)
  assert.match(f.detail, /2\.1\.287/)
})

test('every variable that blocks feature flags is named for the advisor', () => {
  for (const [k, v] of [['DO_NOT_TRACK', '1'], ['DISABLE_GROWTHBOOK', 'true'], ['CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', '0']]) {
    const s = clean()
    s.settings.user.advisorModel = 'opus'
    s.env[k] = v
    assert.match(only(s, 'advisor-inactive').detail, new RegExp(k))
  }
  const off = clean()
  off.settings.user.advisorModel = 'opus'
  off.env.DO_NOT_TRACK = '0'
  assert.ok(!ids(off).includes('advisor-inactive'))
})

test('auto-compaction turned off is reported, with a fix only for the setting', () => {
  const env = clean()
  env.env.DISABLE_AUTO_COMPACT = '1'
  assert.deepEqual(only(env, 'auto-compact-off').fixes, [])
  const setting = clean()
  setting.settings.project.autoCompactEnabled = false
  assert.deepEqual(only(setting, 'auto-compact-off').fixes, [{ scope: 'project', ops: [{ op: 'unset', key: 'autoCompactEnabled' }] }])
})

test('idle compaction turned off is reported', () => {
  const s = clean()
  s.settings.user.idleCompaction = false
  assert.equal(only(s, 'idle-compaction-off').fixes[0].ops[0].key, 'idleCompaction')
})

test('tool search turned off warns when MCP servers are configured', () => {
  const s = clean()
  s.env.ENABLE_TOOL_SEARCH = 'false'
  assert.equal(only(s, 'tool-search-off').severity, 'warn')
  s.env.ENABLE_TOOL_SEARCH = 'auto'
  assert.ok(!ids(s).includes('tool-search-off'))
})

test('a raised bash output limit is reported, and the setting wins over the variable', () => {
  const s = clean()
  s.env.BASH_MAX_OUTPUT_LENGTH = '150000'
  assert.match(only(s, 'bash-output-raised').detail, /BASH_MAX_OUTPUT_LENGTH is 150000/)
  s.settings.user.bashOutputMaxChars = 20000
  assert.ok(!ids(s).includes('bash-output-raised'))
})
