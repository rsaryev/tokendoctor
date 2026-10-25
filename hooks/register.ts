import type { EngineInterface, Register } from 'claude-code'

// Tools for /tokendoctor:optimize. Reading tools run without a prompt. A change runs only after the
// person picks "Apply" in a dialog that shows it: a permission `ask` can be settled by the mode
// (bypass, a -p run) without a person, so the dialog is the mod's own, and with no one to ask
// ($.ui.ask rejects in -p) nothing changes. The tools wait behind ToolSearch, so they add nothing
// to context until the optimize skill loads them.
const PLUGIN = 'tokendoctor'
const tool = <N extends string>(name: N) => `mcp__${PLUGIN}__${name}` as const
const READS: string[] = [tool('metrics'), tool('settings'), tool('config_list')]
const WRITES: string[] = [tool('config_set'), tool('set_setting')]

const text = (value: unknown) => ({ result: typeof value === 'string' ? value : JSON.stringify(value, null, 1) })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.tool.register({
      name: 'metrics',
      description:
        'Token metrics: the current session (context fill, rate limits, cost, context breakdown by category), ' +
        'daily totals for the last `days` (default 14) and the current audit findings. Read-only.',
      inputSchema: { type: 'object', properties: { days: { type: 'number' } } },
    })
    await $.tool.register({
      name: 'settings',
      description:
        'Every setting tokendoctor may change, with its current merged value (unset ones included), ' +
        'whether a change applies live or at the next session, and what it does. Read-only.',
    })
    await $.tool.register({
      name: 'config_list',
      description: 'The rows of the /config menu with their current values, kinds and options. Read-only.',
    })
    await $.tool.register({
      name: 'config_set',
      description: 'Change one /config row (key from config_list), live, as if the person did it in /config. Asks the person.',
      inputSchema: { type: 'object', properties: { key: { type: 'string' }, value: {} }, required: ['key', 'value'] },
    })
    await $.tool.register({
      name: 'set_setting',
      description:
        'Write one setting from the `settings` list to a settings file, with a backup. `value` omitted unsets it. ' +
        'scope: user (default), project or local. Asks the person.',
      inputSchema: {
        type: 'object',
        properties: { key: { type: 'string' }, value: {}, scope: { type: 'string', enum: ['user', 'project', 'local'] } },
        required: ['key'],
      },
    })
    return result
  })

  on('tool.check', async ($, e, next) => {
    if (READS.includes(e.tool)) return { decision: 'allow' }
    if (WRITES.includes(e.tool)) return { decision: 'allow' }
    return next(e)
  })

  on('tool.call', { tool: tool('metrics') }, async ($, e) => {
    const days = typeof e.days === 'number' ? e.days : 14
    const usage = await $.session.usage({ breakdown: 'summary' })
    const b = usage.context.breakdown
    const session = {
      tokens: usage.context.tokens,
      window: usage.context.window,
      compactAt: b?.autoCompactThreshold,
      autoCompact: b?.isAutoCompactEnabled,
      model: b?.model,
      biggest: b?.categories
        .filter(c => c.kind === 'used')
        .sort((x, y) => y.tokens - x.tokens)
        .slice(0, 6)
        .map(c => ({ name: c.name, tokens: c.tokens })),
      rateLimits: usage.rateLimits,
      costUsd: usage.cost?.usd,
    }
    const trend = await bin($, 'tokendoctor-sessions', ['--by', 'day', '--days', String(days), '--json'])
    const audit = await bin($, 'tokendoctor-audit', ['--json'])
    let findings: unknown = audit
    try {
      findings = JSON.parse(audit).findings.map((f: { id: string; severity: string; title: string; fixes?: unknown }) => ({
        id: f.id,
        severity: f.severity,
        title: f.title,
        hasFix: Boolean(f.fixes),
      }))
    } catch {}
    return text({ session, trend: safeJson(trend), findings })
  })

  on('tool.call', { tool: tool('settings') }, async ($) => {
    const out = await bin($, 'tokendoctor-set', ['--list', '--json'])
    const rows = safeJson(out)
    if (!Array.isArray(rows)) return text(out)
    const merged = (await $.settings.read()) as Record<string, unknown>
    const env = (merged.env ?? {}) as Record<string, unknown>
    return text(
      rows.map((r: { key: string }) => ({
        ...r,
        current: r.key.startsWith('env.') ? env[r.key.slice(4)] ?? null : merged[r.key] ?? null,
      })),
    )
  })

  on('tool.call', { tool: tool('config_list') }, async ($) => {
    const rows = await $.config.list()
    return text(rows.map(r => ({ key: r.key, label: r.label, kind: r.kind, value: r.value, options: r.options })))
  })

  on('tool.call', { tool: tool('config_set') }, async ($, e) => {
    const { key, value } = e as unknown as { key: string; value: never }
    const row = (await $.config.list()).find(r => r.key === key)
    if (!row) return text(`Not changed: /config has no row "${key}".`)
    const change = `/config ${row.label}: ${JSON.stringify(row.value)} → ${JSON.stringify(value)} (applies now)`
    if (!(await confirm($, change))) return text(`Not changed: the person did not approve (${change}).`)
    const r = await $.config.set({ key, value })
    return text(r.deny ? `Not changed: ${r.deny}` : `${key} is now ${JSON.stringify(r.value)} (live).`)
  })

  on('tool.call', { tool: tool('set_setting') }, async ($, e) => {
    const { key, value, scope } = e as unknown as { key: string; value?: unknown; scope?: string }
    const args = [key, ...(value === undefined ? ['--unset'] : [JSON.stringify(value)]), '--scope', scope ?? 'user']
    const plan = await bin($, 'tokendoctor-set', args)
    if (!plan.startsWith('Would change')) return text(plan)
    if (!(await confirm($, plan.replace(/\n+Dry run.*$/s, '')))) return text(`Not changed: the person did not approve.\n${plan}`)
    return text(await bin($, 'tokendoctor-set', [...args, '--write']))
  })
}

// The person's yes, in the engine's own dialog. False when they decline, dismiss it, or no one can
// be asked (a -p run).
async function confirm($: EngineInterface, change: string) {
  try {
    const answer = await $.ui.ask(`tokendoctor wants to change a setting:\n${change}\nApply it?`, {
      header: 'tokendoctor',
      options: ['Apply', 'Cancel'],
    })
    return answer === 'Apply'
  } catch {
    return false
  }
}

async function bin($: EngineInterface, name: string, args: string[]) {
  const { exitCode, stdout, stderr } = await $.process.run(['node', `${$.plugin.root}/bin/${name}`, ...args], { timeoutMs: 120_000 })
  return exitCode === 0 ? stdout : `${name} failed (${exitCode}): ${stderr || stdout}`
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}
