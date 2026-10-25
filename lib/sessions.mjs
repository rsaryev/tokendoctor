// Measures where tokens actually went, from the transcripts Claude Code keeps under
// <config>/projects/<project>/<session>.jsonl (subagents in <session>/subagents/agent-*.jsonl).
// Reads usage figures, timestamps, tool names, result sizes and file paths; never message text.
//
// Cost is in input-token equivalents (IE), the API's relative prices: input 1, cache read 0.1,
// 5-minute cache write 1.25, 1-hour cache write 2, output 5. Model prices are not applied, so
// the model split is reported alongside rather than folded in.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const W = { in: 1, read: 0.1, w5: 1.25, w1: 2, out: 5 }
const BIG_CONTEXT = 400000
const LONG_SESSION_TURNS = 500
const IMAGE = /\.(png|jpe?g|gif|webp)$/i

export const family = (m = '') =>
  /fable/.test(m) ? 'fable' : /opus/.test(m) ? 'opus' : /sonnet/.test(m) ? 'sonnet' : /haiku/.test(m) ? 'haiku' : null

function parseJsonl(text) {
  const rows = []
  for (const line of text.split('\n')) {
    if (!line) continue
    try {
      rows.push(JSON.parse(line))
    } catch {}
  }
  return rows
}

// One entry per API response: streamed responses repeat the same message.id over several lines.
function responses(rows) {
  const byId = new Map()
  for (const r of rows) if (r.type === 'assistant' && r.message?.usage && family(r.message.model)) byId.set(r.message.id ?? r.uuid, r)
  return [...byId.values()].sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1))
}

export function cost(u) {
  const w1 = u.cache_creation?.ephemeral_1h_input_tokens ?? 0
  const w5 = u.cache_creation?.ephemeral_5m_input_tokens ?? Math.max(0, (u.cache_creation_input_tokens ?? 0) - w1)
  return (u.input_tokens ?? 0) * W.in + (u.cache_read_input_tokens ?? 0) * W.read + w5 * W.w5 + w1 * W.w1 + (u.output_tokens ?? 0) * W.out
}

const contextOf = (u) => (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
const add = (o, k, v) => (o[k] = (o[k] ?? 0) + v)

// YYYY-MM-DD in the machine's time zone, so a day matches the user's calendar.
export function localDay(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// A cache rebuild: the cached prefix shrank by half or more and a large write followed.
function rebuildCause(prev, cur, compactions) {
  const gap = (new Date(cur.timestamp) - new Date(prev.timestamp)) / 1000
  const u = cur.message.usage
  if (compactions.some((t) => t > prev.timestamp && t <= cur.timestamp)) return 'compaction'
  if (cur.message.model !== prev.message.model) return 'model switch'
  if (cur.version && prev.version && cur.version !== prev.version) return 'Claude Code upgrade'
  const ttl = u.cache_creation?.ephemeral_1h_input_tokens ? 3600 : 300
  if (gap > ttl) return 'idle past the cache TTL'
  return 'other'
}

// Pure: one session's rows plus its subagents' rows ([{ type, rows }]) in, figures out.
export function analyzeSession(rows, subagents = []) {
  const main = responses(rows).filter((r) => !r.isSidechain)
  const s = {
    turns: main.length, start: main[0]?.timestamp ?? null, end: main.at(-1)?.timestamp ?? null,
    cost: 0, mainCost: 0, maxContext: 0, bigContextCost: 0, output: 0, thinking: 0,
    byModel: {}, agents: {}, rebuilds: {}, compactions: [], reads: {}, days: {},
  }
  const day = (r) => (s.days[localDay(r.timestamp)] ??= { cost: 0, mainCost: 0, bigContextCost: 0, turns: 0, sessions: 1, byModel: {} })
  const compactions = []
  for (const r of rows) {
    if (r.subtype !== 'compact_boundary') continue
    compactions.push(r.timestamp)
    s.compactions.push({ trigger: r.compactMetadata?.trigger ?? null, preTokens: r.compactMetadata?.preTokens ?? 0 })
  }
  let prev = null
  for (const r of main) {
    const u = r.message.usage
    const c = cost(u)
    const ctx = contextOf(u)
    s.mainCost += c
    add(s.byModel, family(r.message.model), c)
    const d = day(r)
    d.cost += c
    d.mainCost += c
    d.turns++
    add(d.byModel, family(r.message.model), c)
    if (ctx > BIG_CONTEXT) d.bigContextCost += c
    s.maxContext = Math.max(s.maxContext, ctx)
    if (ctx > BIG_CONTEXT) s.bigContextCost += c
    s.output += u.output_tokens ?? 0
    s.thinking += u.output_tokens_details?.thinking_tokens ?? 0
    if (prev) {
      const before = prev.message.usage.cache_read_input_tokens ?? 0
      const write = u.cache_creation_input_tokens ?? 0
      if (before > 20000 && (u.cache_read_input_tokens ?? 0) < before / 2 && write > 20000) {
        const e = (s.rebuilds[rebuildCause(prev, r, compactions)] ??= { n: 0, cost: 0 })
        e.n++
        e.cost += write * (u.cache_creation?.ephemeral_1h_input_tokens ? W.w1 : W.w5)
      }
    }
    prev = r
  }
  for (const { type, rows: subRows } of subagents) {
    const a = (s.agents[type] ??= { runs: 0, cost: 0, byModel: {} })
    a.runs++
    for (const r of responses(subRows)) {
      const c = cost(r.message.usage)
      a.cost += c
      add(a.byModel, family(r.message.model), c)
      const d = day(r)
      d.cost += c
      add(d.byModel, family(r.message.model), c)
    }
  }
  // Reads by path, to spot the same image read again and again.
  const uses = {}
  for (const r of rows) if (r.type === 'assistant') for (const c of r.message?.content ?? []) if (c.type === 'tool_use' && c.name === 'Read') uses[c.id] = c.input?.file_path
  for (const r of rows) {
    if (r.type !== 'user' || !Array.isArray(r.message?.content)) continue
    for (const c of r.message.content) {
      const path = c.type === 'tool_result' && uses[c.tool_use_id]
      if (path) add(s.reads, path, 1)
    }
  }
  s.cost = s.mainCost + Object.values(s.agents).reduce((n, a) => n + a.cost, 0)
  return s
}

export function sessionFiles(configDir, { days, project } = {}) {
  const root = join(configDir, 'projects')
  if (!existsSync(root)) return []
  const since = days ? Date.now() - days * 864e5 : 0
  const slug = project ? project.replace(/[^A-Za-z0-9]/g, '-') : null
  const files = []
  for (const dir of readdirSync(root)) {
    if (slug && dir !== slug) continue
    const path = join(root, dir)
    if (!statSync(path).isDirectory()) continue
    for (const f of readdirSync(path)) {
      if (!f.endsWith('.jsonl')) continue
      const file = join(path, f)
      if (statSync(file).mtimeMs >= since) files.push({ file, project: dir })
    }
  }
  return files
}

function loadSubagents(file) {
  const dir = file.replace(/\.jsonl$/, '/subagents')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => {
      let type = 'unknown'
      try {
        type = JSON.parse(readFileSync(join(dir, f.replace(/\.jsonl$/, '.meta.json')), 'utf8')).agentType ?? type
      } catch {}
      return { type, rows: parseJsonl(readFileSync(join(dir, f), 'utf8')) }
    })
}

export function loadSessions(configDir, options) {
  return sessionFiles(configDir, options)
    .map(({ file, project }) => ({
      project: project.replace(homedir().replace(/[^A-Za-z0-9]/g, '-') + '-', ''),
      ...analyzeSession(parseJsonl(readFileSync(file, 'utf8')), loadSubagents(file)),
    }))
    .filter((s) => s.turns > 0)
}

// Pure: sessions in, totals and findings out.
export function summarize(sessions) {
  const t = { sessions: sessions.length, cost: 0, mainCost: 0, bigContextCost: 0, output: 0, thinking: 0, byModel: {}, agents: {}, rebuilds: {}, compactions: [] }
  const reads = {}
  for (const s of sessions) {
    t.cost += s.cost
    t.mainCost += s.mainCost
    t.bigContextCost += s.bigContextCost
    t.output += s.output
    t.thinking += s.thinking
    t.compactions.push(...s.compactions)
    for (const [m, c] of Object.entries(s.byModel)) add(t.byModel, m, c)
    for (const [k, e] of Object.entries(s.rebuilds)) {
      const x = (t.rebuilds[k] ??= { n: 0, cost: 0 })
      x.n += e.n
      x.cost += e.cost
    }
    for (const [type, a] of Object.entries(s.agents)) {
      const x = (t.agents[type] ??= { runs: 0, cost: 0, byModel: {} })
      x.runs += a.runs
      x.cost += a.cost
      for (const [m, c] of Object.entries(a.byModel)) add(x.byModel, m, c)
    }
    for (const [p, n] of Object.entries(s.reads)) add(reads, p, n)
  }
  const share = (x) => x / (t.cost || 1)
  const findings = []

  const big = t.bigContextCost / (t.mainCost || 1)
  const preTokens = t.compactions.map((c) => c.preTokens).filter(Boolean)
  const avgPre = preTokens.length ? preTokens.reduce((a, b) => a + b, 0) / preTokens.length : 0
  if (big > 0.3) {
    findings.push({
      id: 'late-compaction', severity: 'warn',
      title: `${Math.round(big * 100)}% of main-thread cost was spent with more than ${BIG_CONTEXT / 1000}K tokens in context`,
      detail:
        (avgPre ? `Compaction ran at about ${Math.round(avgPre / 1000)}K tokens on average. ` : '') +
        'Every turn re-sends the whole context, so turns late in a long conversation cost the most. ' +
        'A smaller autoCompactWindow compacts earlier; /clear between unrelated tasks starts fresh.',
      doc: 'https://code.claude.com/docs/en/model-config.md#set-the-auto-compact-window',
    })
  }

  const expensive = Object.entries(t.agents)
    .map(([type, a]) => ({ type, ...a, top: (a.byModel.opus ?? 0) + (a.byModel.fable ?? 0) }))
    .filter((a) => share(a.top) > 0.05)
    .sort((a, b) => b.top - a.top)
  if (expensive.length) {
    const forks = expensive.some((a) => a.type === 'fork')
    findings.push({
      id: 'subagents-on-top-model', severity: 'warn',
      title: `Subagents on Opus or Fable made ${Math.round(share(expensive.reduce((n, a) => n + a.top, 0)) * 100)}% of all cost`,
      detail:
        expensive.map((a) => `${a.type}: ${a.runs} runs, ${Math.round(share(a.top) * 100)}%`).join('; ') +
        '. CLAUDE_CODE_SUBAGENT_MODEL sets the model for subagents without their own, and an agent ' +
        'named Explore overrides the built-in one (`tokendoctor-audit` covers both).' +
        (forks ? ' Forks always run on the main session\'s model, so they cost what the main thread costs.' : ''),
      doc: 'https://code.claude.com/docs/en/sub-agents.md#choose-a-model',
    })
  }

  const long = sessions.filter((s) => s.turns >= LONG_SESSION_TURNS)
  if (long.length) {
    findings.push({
      id: 'long-sessions', severity: 'info',
      title: `${long.length} session(s) ran ${LONG_SESSION_TURNS}+ turns`,
      detail:
        `They made ${Math.round(share(long.reduce((n, s) => n + s.cost, 0)) * 100)}% of all cost. ` +
        'A long session keeps old work in context; /clear between tasks, or a new session, is cheaper ' +
        'than compacting the same conversation again and again.',
      doc: 'https://code.claude.com/docs/en/costs.md#manage-context-proactively',
    })
  }

  const idle = t.rebuilds['idle past the cache TTL']
  if (idle && share(idle.cost) > 0.01) {
    findings.push({
      id: 'idle-cache-rebuilds', severity: 'info',
      title: `${idle.n} cache rebuild(s) after the prompt cache expired`,
      detail:
        `Coming back after the cache TTL re-writes the whole context (${Math.round(share(idle.cost) * 1000) / 10}% of all cost here). ` +
        '/clear or /compact before a long break makes the next message cheaper.',
      doc: 'https://code.claude.com/docs/en/prompt-caching.md',
    })
  }

  // Text files are re-read after edits as a matter of course; images are the costly repeat.
  const reread = Object.entries(reads).filter(([p, n]) => n >= 3 && IMAGE.test(p)).sort((a, b) => b[1] - a[1])
  if (reread.length) {
    findings.push({
      id: 'images-read-repeatedly', severity: 'info',
      title: `${reread.length} image(s) were read 3 or more times`,
      detail:
        reread.slice(0, 5).map(([p, n]) => `${p.replace(homedir(), '~')} (${n}x)`).join('; ') +
        '. Each read adds the image to context again. Describe what matters in text once, or crop to the part that changed.',
      doc: 'https://code.claude.com/docs/en/costs.md',
    })
  }

  return { totals: t, findings }
}

// Pure: sessions in, one row per local day (sessions counts the sessions active that day).
export function daily(sessions) {
  const out = {}
  for (const s of sessions) {
    for (const [date, d] of Object.entries(s.days ?? {})) {
      const x = (out[date] ??= { date, cost: 0, mainCost: 0, bigContextCost: 0, turns: 0, sessions: 0, byModel: {} })
      x.cost += d.cost
      x.mainCost += d.mainCost
      x.bigContextCost += d.bigContextCost
      x.turns += d.turns
      x.sessions += d.sessions
      for (const [m, c] of Object.entries(d.byModel)) add(x.byModel, m, c)
    }
  }
  return Object.values(out).sort((a, b) => (a.date < b.date ? -1 : 1))
}
