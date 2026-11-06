import type { EngineInterface, Register } from 'claude-code'
import { calibrate, chars, dedupe, IMAGE_TOKENS, imagesIn, slide } from './window.ts'
import * as menu from '../lib/console.mjs'

// Tools for /tokendoctor:optimize. Reading tools run without a prompt. A change runs only after the
// person picks "Apply" in a dialog that shows it: a permission `ask` can be settled by the mode
// (bypass, a -p run) without a person, so the dialog is the mod's own, and with no one to ask
// ($.ui.ask rejects in -p) nothing changes. The tools wait behind ToolSearch, so they add nothing
// to context until the optimize skill loads them.
const PLUGIN = 'tokendoctor'
const USER_ID = 'tokendoctor@tokendoctor'
const tool = <N extends string>(name: N) => `mcp__${PLUGIN}__${name}` as const
const READS: string[] = [tool('metrics'), tool('settings'), tool('config_list')]
const WRITES: string[] = [tool('config_set'), tool('set_setting')]

const text = (value: unknown) => ({ result: typeof value === 'string' ? value : JSON.stringify(value, null, 1) })

export const register: Register = (on, options) => {
  // The options are the ones /tokendoctor writes (pluginConfigs of tokendoctor@tokendoctor). The copy
  // tokendoctor-org-install puts in the system folder has another id, so it reads them from there at
  // session start rather than keep a second set that could disagree.
  let slideOn = options.slide === true
  let slideTo = clampSlideTo(options.slideTo)
  // How long the conversation was after the last slide. Back at the window within a few steps of it
  // means a slide cannot keep up (an output nearly as large as the window): the summary takes over,
  // before Claude Code stops the session for compacting over and over.
  let afterSlide = -Infinity
  // What Claude Code adds back after a compaction beyond the estimate (the files it attaches again,
  // text that runs more tokens than counted): learned from the first request after each slide.
  let extra: number | undefined
  let measure: number | undefined

  // The first tool call after a slide comes from the first request after it: its real size, against
  // the estimate, says how far off the estimate was.
  on('tool.call', async ($, e, next) => {
    if (measure === undefined) return next(e)
    const estimate = measure
    measure = undefined
    const real = (await $.session.usage()).context.tokens
    if (real) extra = calibrate(extra, real - estimate)
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const shared = await $.settings
      .read()
      .then(s => (s as { pluginConfigs?: Record<string, { options?: Record<string, unknown> }> }).pluginConfigs?.[USER_ID]?.options)
      .catch(() => undefined)
    if (shared && 'slide' in shared) slideOn = shared.slide === true
    if (shared && 'slideTo' in shared) slideTo = clampSlideTo(shared.slideTo)
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
    await $.command.register({
      name: 'tokendoctor',
      description: 'Show and change token settings by name (no model call)',
      argumentHint: '[window|slide|cache|effort|model|subagents|all|fix|undo] [value|reset]',
    })
    void audit($)
      .then(found => {
        // Where Claude Code's guard sends compaction past the mods a person installs, the slide would
        // be on and never run: say so once, with the way out (lib/guard.mjs).
        const blocked = slideOn && found.find(f => f.id === 'slide-blocked-by-guard')
        if (blocked) $.ui.toast('tokendoctor: the slide cannot run under this login, Claude Code will summarize. /tokendoctor slide says why.', { timeoutMs: 12_000 })
      })
      .catch(() => {})
    return result
  })

  // /tokendoctor: the settings by short name, answered here with no model call. What the person
  // types in full is applied as typed; an audit fix, which they did not spell out, is shown first.
  on('command.run', { command: 'tokendoctor' }, async ($, e) => {
    const p = menu.parse(e.args)
    const merged = (await $.settings.read()) as Record<string, unknown>
    const compactsAt = await $.session
      .usage({ breakdown: 'summary' })
      .then(u => u.context.breakdown?.autoCompactThreshold)
      .catch(() => undefined)
    if (p.action === 'overview') return { text: menu.overview(merged, await audit($), compactsAt) }
    if (p.action === 'all') return { text: menu.all(merged, compactsAt) }
    if (p.action === 'unknown') return { text: menu.unknown(p.name) }
    if (p.action === 'explain') return { text: menu.explain(p.entry, merged, await audit($), compactsAt) }
    if (p.action === 'fix') return { text: await fix($, p.id, p.scope) }
    if (p.action === 'undo') return { text: await undo($, p.n) }

    const change = menu.op(p.entry, p.value)
    if ('error' in change) return { text: change.error }
    const before = menu.display(menu.current(merged, p.entry.key))
    const v = change.op.op === 'set' ? change.op.value : undefined
    const out = await bin($, 'tokendoctor-set', [p.entry.key, ...(v === undefined ? ['--unset'] : [JSON.stringify(v)]), '--scope', p.scope, '--write'])
    if (/no change/.test(out)) return { text: `${p.entry.name} is already ${menu.display(v)} in ${p.scope} settings.` }
    if (!/\bwritten\b/.test(out)) return { text: out.trim() }
    void audit($).catch(() => {})
    const backup = /backup: (\S+)/.exec(out)?.[1]
    const when = menu.live(p.entry.key) ? 'Applies now.' : 'Takes effect in the next session.'
    return { text: `${p.entry.name}: ${before} → ${menu.display(v)} in ${p.scope} settings. ${when}${backup ? `\nBackup: ${backup}` : ''}` }
  })

  on('prompt.autocomplete', async ($, e, next) => {
    if (!e.text.startsWith('/tokendoctor ')) return next(e)
    const mine = menu.complete(e.text, e.start, e.token, findings)
    if (!mine.length) return next(e)
    const r = await next(e)
    return { suggestions: [...mine, ...r.suggestions] }
  })

  // In place of a summary where Claude Code compacts, the window slides (hooks/window.ts). A /compact
  // the person types still summarizes, and so does a slide that cannot free enough.
  on('session.compact', async ($, e, next) => {
    if (!slideOn || e.agentId !== undefined) return next(e)
    // A summary computed ahead of time is a model request a slide never uses.
    if (e.trigger === 'precompute') return { skip: 'tokendoctor slides the window instead' }
    // A summary leaves a few messages: the next compaction counts from none.
    const summarize = () => ((afterSlide = -Infinity), next(e))
    // What the person (`/compact`) or a plugin asks for is a summary. Every compaction Claude Code
    // starts on its own slides: at the window, and idle compaction before the hour's cache expires,
    // whatever trigger a build names it with.
    if (e.trigger === 'manual' || e.trigger === 'plugin') return summarize()
    const messages = dedupe(e.messages)
    // Just slid and barely grown since: a summary this time, and the next compaction starts afresh.
    if (messages.length - afterSlide < 6) return summarize()

    const usage = await $.session.usage({ breakdown: 'summary' })
    const b = usage.context.breakdown
    // Where Claude Code compacts: the window less its reserve for the answer and the summary.
    const window = b?.autoCompactThreshold || b?.rawMaxTokens || usage.context.window
    const size = messages.reduce((n, m) => n + chars(m), 0)
    const counted = b?.categories.find(c => c.name === 'Messages')?.tokens
    // What the messages count beyond their text: images (screenshots) and thinking, which can run to
    // tens of thousands of tokens an answer. A message handed back without its handle carries
    // neither, so a slide frees all of it. Text runs 2.5 to 5 characters a token (code, prose, other
    // scripts); what the messages count beyond that is not text.
    const images = imagesIn(messages, afterSlide) * IMAGE_TOKENS
    const perChar = counted && size ? Math.min(0.4, Math.max(1 / 5, (counted - images) / size)) : 1 / 4
    const dropped = images + (counted ? Math.max(0, counted - images - Math.round(size * perChar)) : 0)
    const now = usage.context.tokens ?? b?.totalTokens ?? Math.round(size * perChar) + images
    const target = Math.round((window * slideTo) / 100)
    if (now <= target) return summarize()
    // Short of the target, a slide still has to leave the context well below where Claude Code
    // compacts (60%), or it would slide again a few calls later. What no slide frees (the system
    // prompt, tools, what Claude Code attaches) a summary keeps too, so it is no reason to summarize.
    const added = extra ?? 0
    const least = Math.max(1, Math.round(now - dropped - window * 0.6))
    const s = slide(messages, now + added - target - dropped, perChar, least)
    if (!s) {
      $.ui.toast('tokendoctor: nothing left to elide, so the conversation is summarized')
      return summarize()
    }
    const after = Math.min(Math.round(window * 0.9), now - s.freed - dropped + added)
    $.ui.toast(
      `tokendoctor slid the window: ${k(now)} → ${k(after)}, ${s.elided} old tool outputs elided` +
        `${s.turns ? `, the ${s.turns} oldest turns removed` : ''}` +
        `${dropped >= 1000 ? `, images and thinking dropped (${k(dropped)})` : ''}, no summary`,
    )
    afterSlide = s.messages.length
    measure = now - s.freed - dropped
    return { messages: s.messages, tokensBefore: now, tokensAfter: after }
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
      compactWindow: b?.rawMaxTokens,
      // tokendoctor.slide: where Claude Code compacts, old tool outputs are elided instead of summarized.
      slide: slideOn ? { to: `${slideTo}% of where Claude Code compacts` } : false,
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
    // `path` is where the value lives (env.X under env, a plugin option under pluginConfigs).
    const at = (path: string) =>
      path.split('.').reduce<unknown>((node, p) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[p] : undefined), merged)
    return text(rows.map((r: { key: string; path?: string }) => ({ ...r, current: at(r.path ?? r.key) ?? null })))
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

// The audit's findings, for /tokendoctor's hints and typeahead; read at the start and after a change.
let findings: menu.Finding[] = []

async function audit($: EngineInterface) {
  const parsed = safeJson(await bin($, 'tokendoctor-audit', ['--json'])) as { findings?: menu.Finding[] }
  if (Array.isArray(parsed?.findings)) findings = parsed.findings
  return findings
}

// The changes tokendoctor wrote, or one of them put back: typed by number, applied as typed.
async function undo($: EngineInterface, n: string | undefined) {
  if (!n) {
    const journal = safeJson(await bin($, 'tokendoctor-undo', ['--json']))
    return Array.isArray(journal) ? menu.undoList(journal as menu.JournalEntry[]) : String(journal)
  }
  if (!/^\d+$/.test(n)) return 'Put back which one? /tokendoctor undo lists them by number.'
  const out = await bin($, 'tokendoctor-undo', [n, '--write'])
  void audit($).catch(() => {})
  return out.trim()
}

// An audit fix: the list, or one fix shown in a dialog and written on Apply.
async function fix($: EngineInterface, id: string | undefined, scope: string | undefined) {
  if (!id) {
    const fixable = (await audit($)).filter(f => f.fixes)
    if (!fixable.length) return 'The audit has no fixes to apply.'
    return ['The audit has fixes for:', ...fixable.map(f => `  /tokendoctor fix ${f.id.padEnd(28)} ${f.title}`)].join('\n')
  }
  const args = [id, ...(scope ? ['--scope', scope] : [])]
  const plan = await bin($, 'tokendoctor-apply', args)
  if (!plan.startsWith('Would change')) return plan.trim()
  const shown = plan.replace(/\n+Dry run.*$/s, '').trim()
  if (!(await confirm($, shown))) return `Not changed.\n${shown}`
  const out = await bin($, 'tokendoctor-apply', [...args, '--write'])
  void audit($).catch(() => {})
  return out.trim()
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

function clampSlideTo(v: unknown) {
  return typeof v === 'number' ? Math.min(90, Math.max(20, v)) : 25
}

function k(tokens: number) {
  return `${Math.round(tokens / 1000)}K`
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}
