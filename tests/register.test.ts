import { expect, test } from 'claude-code/testing'

const start = { cwd: '/', surface: 'terminal', isInteractive: true } as const

test('the five tools are registered at session start, behind ToolSearch', async ($, on) => {
  const names: string[] = []
  on('tool.register', (_, e) => {
    names.push(e.name)
    expect(e.isDeferred).toBe(undefined)
    return { value: { tool: `mcp__tokendoctor__${e.name}` } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start(start)
  expect(names).toEqual(['metrics', 'settings', 'config_list', 'config_set', 'set_setting'])
})

test('its own tools skip the permission prompt, other tools are left alone', async ($, on) => {
  on('tool.check', () => ({ decision: 'deny', reason: 'engine' }))
  expect((await $.tool.check({ tool: 'mcp__tokendoctor__metrics', input: {} })).decision).toBe('allow')
  expect((await $.tool.check({ tool: 'mcp__tokendoctor__set_setting', input: {} })).decision).toBe('allow')
  expect((await $.tool.check({ tool: 'Bash', input: { command: 'ls' } })).decision).toBe('deny')
})

test('config_list reports the /config rows and config_set relays a refusal', async ($, on) => {
  on('config.list', () => ({ value: [{ key: 'verbose', label: 'Verbose', kind: 'boolean', value: false, owner: 'user' }] }))
  let sets = 0
  on('config.set', (_, e) => (sets++, { value: e.value }))
  let answer = 'Apply'
  on('tool.call', { tool: 'AskUserQuestion' }, (_, e) => ({ result: { questions: e.questions, answers: { [e.questions[0]!.question]: answer } } }))
  const list = await $.tool.call({ tool: 'mcp__tokendoctor__config_list' })
  expect(String(list.result)).toContain('"verbose"')
  const ok = await $.tool.call({ tool: 'mcp__tokendoctor__config_set', key: 'verbose', value: true })
  expect(String(ok.result)).toContain('verbose is now true')
  answer = 'Cancel'
  const no = await $.tool.call({ tool: 'mcp__tokendoctor__config_set', key: 'verbose', value: false })
  expect(String(no.result)).toContain('did not approve')
  const missing = await $.tool.call({ tool: 'mcp__tokendoctor__config_set', key: 'nope', value: 1 })
  expect(String(missing.result)).toContain('has no row')
  expect(sets).toBe(1)
})

test('set_setting shows the dry run, writes only on Apply, and never without a person', async ($, on) => {
  const runs: (readonly string[])[] = []
  on('process.run', (_, e) => {
    runs.push(e.argv.slice(2))
    const write = e.argv.includes('--write')
    return { value: { exitCode: 0, stdout: write ? 'Applying (project): written' : 'Would change (project): x\n\nDry run. Re-run with --write to apply.', stderr: '' } }
  })
  let question = ''
  on('tool.call', { tool: 'AskUserQuestion' }, (_, e) => {
    question = e.questions[0]!.question
    return { result: { questions: e.questions, answers: { [question]: 'Apply' } } }
  })
  const r = await $.tool.call({ tool: 'mcp__tokendoctor__set_setting', key: 'autoCompactWindow', value: 400000, scope: 'project' })
  expect(runs).toEqual([
    ['autoCompactWindow', '400000', '--scope', 'project'],
    ['autoCompactWindow', '400000', '--scope', 'project', '--write'],
  ])
  expect(question).toContain('Would change (project): x')
  expect(String(r.result)).toContain('written')
})

test('with no one to ask (a -p run) nothing is written', async ($, on) => {
  const runs: (readonly string[])[] = []
  on('process.run', (_, e) => (runs.push(e.argv.slice(2)), { value: { exitCode: 0, stdout: 'Would change (user): x', stderr: '' } }))
  on('tool.call', { tool: 'AskUserQuestion' }, () => ({ deny: 'no one to ask' }))
  const r = await $.tool.call({ tool: 'mcp__tokendoctor__set_setting', key: 'idleCompaction' })
  expect(String(r.result)).toContain('did not approve')
  expect(runs).toEqual([['idleCompaction', '--unset', '--scope', 'user']])
})

test('metrics joins the session, the daily trend and the audit findings', async ($, on) => {
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: {
        tokens: 120000,
        window: 1000000,
        percent: 12,
        breakdown: {
          autoCompactThreshold: 367000,
          isAutoCompactEnabled: true,
          model: 'claude-opus-5-5',
          categories: [
            { name: 'Messages', tokens: 90000, kind: 'used' },
            { name: 'Free space', tokens: 800000, kind: 'free' },
            { name: 'System tools', tokens: 20000, kind: 'used' },
          ],
        },
      },
      rateLimits: [],
      cost: { usd: 1.5 },
    },
  }))
  on('process.run', (_, e) => ({
    value: {
      exitCode: 0,
      stderr: '',
      stdout: e.argv[1]?.endsWith('tokendoctor-audit')
        ? JSON.stringify({ findings: [{ id: 'auto-compact-off', severity: 'warn', title: 't', fixes: [] }] })
        : JSON.stringify([{ date: '2026-10-24', cost: 1 }]),
    },
  }))
  const r = JSON.parse(String((await $.tool.call({ tool: 'mcp__tokendoctor__metrics', days: 7 })).result))
  expect(r.session.compactAt).toBe(367000)
  expect(r.session.biggest.map((c: { name: string }) => c.name)).toEqual(['Messages', 'System tools'])
  expect(r.trend[0].date).toBe('2026-10-24')
  expect(r.findings).toEqual([{ id: 'auto-compact-off', severity: 'warn', title: 't', hasFix: true }])
})

test('settings shows each tunable with its current merged value, unset ones as null', async ($, on) => {
  on('process.run', () => ({
    value: { exitCode: 0, stderr: '', stdout: JSON.stringify([{ key: 'autoCompactWindow', live: true, about: 'a' }, { key: 'env.ENABLE_TOOL_SEARCH', live: false, about: 'b' }, { key: 'idleCompaction', live: true, about: 'c' }]) },
  }))
  on('settings.read', () => ({ value: { autoCompactWindow: 400000, env: { ENABLE_TOOL_SEARCH: 'auto' } } }))
  const rows = JSON.parse(String((await $.tool.call({ tool: 'mcp__tokendoctor__settings' })).result))
  expect(rows.map((r: { current: unknown }) => r.current)).toEqual([400000, 'auto', null])
})
