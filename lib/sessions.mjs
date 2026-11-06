// Measures where tokens actually went, from the transcripts Claude Code keeps under
// <config>/projects/<project>/<session>.jsonl (subagents in <session>/subagents/agent-*.jsonl, and a
// workflow's agents one folder down, in <session>/subagents/workflows/<run>/agent-*.jsonl).
// Reads usage figures, timestamps, tool names, result sizes and file paths; never message text.
//
// Cost is in dollars at the Claude API's list price of each response's model (lib/prices.mjs), plus
// an estimate for each summary compaction's own request, which the transcript does not record. On a
// Pro or Max plan it is what the same work would cost on the API, not what it took from the plan.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { hiddenUsd, ownTotal, rates, summaryUsd, usd } from './prices.mjs'
import { fileRead, waits } from './reads.mjs'

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

/** One response's cost in dollars at its model's list price; 0 for a model lib/prices.mjs does not have. */
export function cost(u, model) {
  return usd(u, model)?.total ?? 0
}

const contextOf = (u) => (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
const add = (o, k, v) => (o[k] = (o[k] ?? 0) + v)

const resultChars = (c) =>
  typeof c.content === 'string' ? c.content.length : (c.content ?? []).reduce((n, x) => n + (x.text?.length ?? (x.type === 'image' ? 6000 : 0)), 0)

/** A blank tool tally: calls and output characters per tool, and what the Bash calls were. */
const blankTools = () => ({ byTool: {}, bash: { calls: 0, chars: 0, fileReads: 0, fileReadChars: 0, waits: 0 }, files: {} })

// Tool use in one conversation's rows, added to `t`: calls and output size per tool, Bash calls that
// only printed files or waited in a loop, and how often each file was read (Read or a Bash print).
function tally(rows, t) {
  const uses = {}
  for (const r of rows) {
    const content = r.message?.content
    if (!Array.isArray(content)) continue
    for (const c of content) {
      if (c.type === 'tool_use') {
        const files = c.name === 'Bash' ? fileRead(c.input?.command ?? '') : undefined
        uses[c.id] = { name: c.name, files }
        const e = (t.byTool[c.name] ??= { calls: 0, chars: 0 })
        e.calls++
        if (c.name === 'Read' && c.input?.file_path) add(t.files, c.input.file_path, 1)
        if (c.name === 'Bash') {
          t.bash.calls++
          if (files) { t.bash.fileReads++; for (const f of files) add(t.files, f, 1) }
          if (waits(c.input?.command)) t.bash.waits++
        }
      } else if (c.type === 'tool_result' && uses[c.tool_use_id]) {
        const u = uses[c.tool_use_id]
        const n = resultChars(c)
        t.byTool[u.name].chars += n
        if (u.name === 'Bash') { t.bash.chars += n; if (u.files) t.bash.fileReadChars += n }
      }
    }
  }
}

function mergeTools(into, t) {
  for (const [k, e] of Object.entries(t.byTool)) {
    const x = (into.byTool[k] ??= { calls: 0, chars: 0 })
    x.calls += e.calls
    x.chars += e.chars
  }
  for (const k of Object.keys(t.bash)) into.bash[k] += t.bash[k]
  for (const [f, n] of Object.entries(t.files)) add(into.files, f, n)
}

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

/** The main thread's Read calls in order: { at, path }. */
function mainReads(rows) {
  const out = []
  for (const r of rows) {
    if (r.type !== 'assistant' || r.isSidechain) continue
    for (const c of r.message?.content ?? []) {
      if (c.type === 'tool_use' && c.name === 'Read' && typeof c.input?.file_path === 'string') out.push({ at: r.timestamp, path: c.input.file_path })
    }
  }
  return out
}

/** Requests after a compaction in which reading a file again counts as having lost it. */
const REREAD_WINDOW = 10

/**
 * Files read before a compaction and read again within the next REREAD_WINDOW main-thread requests:
 * what the conversation lost and had to fetch again. A summary keeps a gist of the files; a slide
 * keeps a pointer to each. Neither replay nor a cost figure shows this, the transcript does.
 */
function rereadsAfter(reads, at, main) {
  const before = new Set(reads.filter((x) => x.at <= at).map((x) => x.path))
  if (!before.size) return 0
  const until = main.filter((m) => m.timestamp > at)[REREAD_WINDOW - 1]?.timestamp ?? '￿'
  return new Set(reads.filter((x) => x.at > at && x.at <= until && before.has(x.path)).map((x) => x.path)).size
}

// Pure: one session's rows plus its subagents' rows ([{ type, rows }]) in, figures out.
export function analyzeSession(rows, subagents = []) {
  const main = responses(rows).filter((r) => !r.isSidechain)
  const s = {
    turns: main.length, start: main[0]?.timestamp ?? null, end: main.at(-1)?.timestamp ?? null,
    cost: 0, mainCost: 0, hiddenCost: 0, hiddenFrom: null, unpriced: 0, maxContext: 0, bigContextCost: 0, output: 0, thinking: 0,
    byModel: {}, agents: {}, rebuilds: {}, compactions: [], reads: {}, days: {},
    tools: { main: blankTools(), subagents: blankTools() }, runs: [],
  }
  const day = (r) => (s.days[localDay(r.timestamp)] ??= { cost: 0, mainCost: 0, bigContextCost: 0, turns: 0, sessions: 1, byModel: {} })
  const compactions = []
  const marks = []
  const reads = mainReads(rows)
  for (const [i, r] of rows.entries()) {
    if (r.subtype !== 'compact_boundary') continue
    compactions.push(r.timestamp)
    const preTokens = r.compactMetadata?.preTokens ?? 0
    // A summary compaction is followed by the summary; its request is billed but not written down.
    const summary = rows.slice(i + 1, i + 4).find((x) => x.isCompactSummary)
    s.compactions.push({ trigger: r.compactMetadata?.trigger ?? null, preTokens, summary: Boolean(summary), rereads: rereadsAfter(reads, r.timestamp, main) })
    const before = summary && main.filter((m) => m.timestamp <= r.timestamp).at(-1)
    if (before) marks.push({ at: r, model: before.message.model, usd: summaryUsd(preTokens, JSON.stringify(summary.message?.content ?? '').length, before.message.model) })
  }
  let prev = null
  for (const r of main) {
    const u = r.message.usage
    const c = cost(u, r.message.model)
    if (!usd(u, r.message.model)) s.unpriced++
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
        const rate = rates(u, r.message.model)
        if (rate) e.cost += write * (u.cache_creation?.ephemeral_1h_input_tokens ? rate.w1 : rate.w5)
      }
    }
    prev = r
  }
  tally(rows, s.tools.main)
  for (const { type, rows: subRows } of subagents) {
    const a = (s.agents[type] ??= { runs: 0, cost: 0, byModel: {} })
    a.runs++
    tally(subRows, s.tools.subagents)
    const run = { type, model: null, requests: 0, maxContext: 0, cost: 0 }
    s.runs.push(run)
    for (const r of responses(subRows)) {
      const c = cost(r.message.usage, r.message.model)
      if (!usd(r.message.usage, r.message.model)) s.unpriced++
      run.requests++
      run.cost += c
      run.model = family(r.message.model)
      run.maxContext = Math.max(run.maxContext, contextOf(r.message.usage))
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
  // What Claude Code billed beyond these responses (lib/prices.mjs): its own total where it holds,
  // else the summaries' estimate; counted with the main thread, where the summaries were, or spread
  // over the main thread's days when there were none.
  const responsesCost = s.mainCost + Object.values(s.agents).reduce((n, a) => n + a.cost, 0)
  const firstAt = Date.parse(rows.find((r) => r.timestamp)?.timestamp ?? '')
  const h = hiddenUsd(ownTotal(rows.filter((r) => r.type === 'cost-state'), firstAt), responsesCost, marks.reduce((n, m) => n + m.usd, 0))
  s.hiddenFrom = h.from
  const over = marks.length ? marks : main.map((r) => ({ at: r, model: r.message.model, usd: cost(r.message.usage, r.message.model) }))
  const weight = over.reduce((n, m) => n + m.usd, 0)
  if (h.usd > 0 && weight > 0) {
    for (const m of over) {
      const c = (h.usd * m.usd) / weight
      s.hiddenCost += c
      s.mainCost += c
      add(s.byModel, family(m.model), c)
      const d = day(m.at)
      d.cost += c
      d.mainCost += c
      add(d.byModel, family(m.model), c)
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

/** A session's subagent transcripts, at any depth under <session>/subagents, each with its agent type. */
export function subagentFiles(file) {
  const out = []
  const walk = (dir, depth) => {
    if (depth > 4 || !existsSync(dir)) return
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, f.name)
      if (f.isDirectory()) walk(path, depth + 1)
      else if (f.name.endsWith('.jsonl')) {
        let type = 'unknown'
        try {
          type = JSON.parse(readFileSync(path.replace(/\.jsonl$/, '.meta.json'), 'utf8')).agentType ?? type
        } catch {}
        out.push({ path, type })
      }
    }
  }
  walk(file.replace(/\.jsonl$/, '/subagents'), 0)
  return out
}

function loadSubagents(file) {
  return subagentFiles(file).map(({ path, type }) => ({ type, rows: parseJsonl(readFileSync(path, 'utf8')) }))
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
  const t = { sessions: sessions.length, cost: 0, mainCost: 0, hiddenCost: 0, unpriced: 0, bigContextCost: 0, output: 0, thinking: 0, byModel: {}, agents: {}, rebuilds: {}, compactions: [] }
  const reads = {}
  const tools = { main: blankTools(), subagents: blankTools() }
  const runs = []
  for (const s of sessions) {
    if (s.tools) { mergeTools(tools.main, s.tools.main); mergeTools(tools.subagents, s.tools.subagents) }
    runs.push(...(s.runs ?? []))
    t.cost += s.cost
    t.mainCost += s.mainCost
    t.hiddenCost += s.hiddenCost ?? 0
    t.unpriced += s.unpriced ?? 0
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

  // What a compaction lost, by kind: files read before it and read again right after.
  const kinds = { summary: t.compactions.filter((c) => c.summary), slide: t.compactions.filter((c) => !c.summary) }
  const per = (list) => list.reduce((n, c) => n + (c.rereads ?? 0), 0) / (list.length || 1)
  if (kinds.summary.length >= 3 && per(kinds.summary) >= 1) {
    const slid = kinds.slide.length >= 3 ? ` After the ${kinds.slide.length} slides: ${per(kinds.slide).toFixed(1)}.` : ''
    findings.push({
      id: 'rereads-after-compaction', severity: 'info',
      title: `After a summary, Claude read ${per(kinds.summary).toFixed(1)} files again on average`,
      detail:
        `Files read before each of ${kinds.summary.length} summaries and read again within the next ${REREAD_WINDOW} requests.${slid} ` +
        'A re-read is context the summary lost and the model fetched again, a cost the token counts of the summary do not show. ' +
        'A `# Compact instructions` section in CLAUDE.md can tell the summary which files to keep, and compacting between tasks ' +
        '(`/compact` at a natural break) leaves less half-done work to lose.',
      doc: 'https://code.claude.com/docs/en/costs.md#manage-context-proactively',
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

  return { totals: t, findings, usage: usage(tools, runs) }
}

// Raw figures for the model reading the report to draw its own conclusions from: the tools each side
// used and how much they printed, the Bash calls that only printed a file or waited in a loop, the
// files read most often, and how large the subagent runs grew.
function usage(tools, runs) {
  const side = (t) => ({
    tools: Object.fromEntries(Object.entries(t.byTool).sort((a, b) => b[1].chars - a[1].chars).slice(0, 12)),
    bash: t.bash,
  })
  const files = {}
  mergeTools({ byTool: {}, bash: blankTools().bash, files }, tools.main)
  mergeTools({ byTool: {}, bash: blankTools().bash, files }, tools.subagents)
  const sizes = runs.map((r) => r.requests).sort((a, b) => a - b)
  const at = (q) => sizes[Math.min(sizes.length - 1, Math.floor(q * sizes.length))] ?? 0
  return {
    main: side(tools.main),
    subagents: side(tools.subagents),
    filesReadMost: Object.entries(files).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([path, times]) => ({ path: path.replace(homedir(), '~'), times })),
    subagentRuns: {
      runs: runs.length,
      requests: { median: at(0.5), p90: at(0.9), max: sizes.at(-1) ?? 0 },
      over200KContext: runs.filter((r) => r.maxContext > 200_000).length,
      largest: [...runs].sort((a, b) => b.cost - a.cost).slice(0, 5)
        .map((r) => ({ type: r.type, model: r.model, requests: r.requests, maxContext: r.maxContext })),
    },
  }
}

// Pure: sessions in, one row per local day (sessions counts the sessions active that day). Costs are
// dollars at API list prices; `unit: 'usd'` tells them from rows written before 0.5.1, which were in
// input-token equivalents.
export function daily(sessions) {
  const out = {}
  for (const s of sessions) {
    for (const [date, d] of Object.entries(s.days ?? {})) {
      const x = (out[date] ??= { date, unit: 'usd', cost: 0, mainCost: 0, bigContextCost: 0, turns: 0, sessions: 0, byModel: {} })
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

// Per session: its main conversation's usage, request by request, and what its subagents cost (which
// a smaller window in the main conversation leaves as it was). For lib/replay.mjs.
export function loadUsage(configDir, options) {
  return sessionFiles(configDir, options)
    .map(({ file, project }) => {
      const main = responses(parseJsonl(readFileSync(file, 'utf8'))).filter((r) => !r.isSidechain)
      const agents = loadSubagents(file).reduce((n, a) => n + responses(a.rows).reduce((m, r) => m + cost(r.message.usage, r.message.model), 0), 0)
      return { project, file, models: [...new Set(main.map((r) => family(r.message.model)))], usage: main.map((r) => ({ usage: r.message.usage, model: r.message.model })), agents }
    })
    .filter((s) => s.usage.length)
}
