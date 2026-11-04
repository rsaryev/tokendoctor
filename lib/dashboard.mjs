// Every request in the local transcripts, rolled up for templates/dashboard.html: by day, project,
// model, effort, main thread or subagent type, and (main thread) context size, with the tokens split
// by kind. Reads usage figures, timestamps and agent types; never message text.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hiddenUsd, ownTotal, PRICES, summaryUsd, usd } from './prices.mjs'
import { family, localDay, sessionFiles, subagentFiles } from './sessions.mjs'

export const KINDS = ['input', 'cacheWrite', 'cacheRead', 'output']
/** Kinds of cost: the four of tokens, web searches, and the estimated summary requests. */
export const COSTS = ['input', 'cacheWrite', 'cacheRead', 'output', 'search', 'hidden']
const CONTEXT = [[0, '<100K'], [100e3, '100–200K'], [200e3, '200–400K'], [400e3, '400K+']]

// Assistant responses in a transcript, once each (a streamed response repeats its message.id), its
// summary compactions (the compact_boundary entry's preTokens and the summary's length that follows),
// Claude Code's own cost-state lines, and the time of the first line.
function responses(text) {
  const byId = new Map()
  const summaries = []
  const states = []
  const firstAt = Date.parse(text.slice(0, 4000).match(/"timestamp":"([^"]+)"/)?.[1] ?? '')
  let boundary = null
  let at = 0
  while (at < text.length) {
    let end = text.indexOf('\n', at)
    if (end < 0) end = text.length
    // Only lines that can hold a response are parsed: most of a transcript is tool output.
    if (end - at > 40 && text.startsWith('{', at)) {
      const line = text.slice(at, end)
      if (line.includes('"usage"') && line.includes('"assistant"')) {
        try {
          const r = JSON.parse(line)
          if (r.type === 'assistant' && r.message?.usage && family(r.message.model)) byId.set(r.message.id ?? r.uuid, r)
        } catch {}
      } else if (line.includes('"compact_boundary"')) {
        try {
          const r = JSON.parse(line)
          if (r.subtype === 'compact_boundary') boundary = { timestamp: r.timestamp, preTokens: r.compactMetadata?.preTokens ?? 0, last: [...byId.values()].at(-1) }
        } catch {}
      } else if (line.startsWith('{"type":"cost-state"')) {
        try {
          states.push(JSON.parse(line))
        } catch {}
      } else if (boundary && line.includes('"isCompactSummary":true')) {
        try {
          const r = JSON.parse(line)
          if (boundary.last) summaries.push({ ...boundary, chars: JSON.stringify(r.message?.content ?? '').length })
        } catch {}
        boundary = null
      }
    }
    at = end + 1
  }
  return { list: [...byId.values()], summaries, states, firstAt }
}

function tokens(u) {
  return {
    input: u.input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    thinking: u.output_tokens_details?.thinking_tokens ?? 0,
    searches: u.server_tool_use?.web_search_requests ?? 0,
  }
}
const blankRow = () => ({ requests: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, thinking: 0, searches: 0, summaries: 0, usd: Object.fromEntries(COSTS.map((k) => [k, 0])) })

const contextBucket = (u) => {
  const n = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
  return CONTEXT.filter(([lo]) => n >= lo).at(-1)[1]
}

/**
 * Rows keyed by day|project|model|effort|thread|context, each with requests, tokens by kind, thinking,
 * web searches, estimated summary requests, and dollars by kind at the model's list price; plus
 * dollars by day and hour, and one line per session. `days` limits by file age. Responses from a model
 * lib/prices.mjs does not have are counted in `unpriced` and left out of the cost.
 */
export function collect(configDir, { days } = {}) {
  const home = homedir().replace(/[^A-Za-z0-9]/g, '-') + '-'
  const rows = new Map()
  const hours = {}
  const sessions = []
  let runs = 0
  let unpriced = 0
  let own = 0
  const since = days ? localDay(Date.now() - (days - 1) * 864e5) : ''

  // A row for its key, created empty.
  const row = (key) => {
    let x = rows.get(key)
    if (!x) rows.set(key, (x = blankRow()))
    return x
  }
  const hour = (at, c) => {
    const h = (hours[localDay(at)] ??= Array(24).fill(0))
    h[new Date(at).getHours()] += c
  }
  // One response: its tokens and dollars into its row. Returns where it went, for the hidden part.
  const add = (r, project, thread) => {
    if (!r.timestamp || Number.isNaN(Date.parse(r.timestamp))) return null
    const day = localDay(r.timestamp)
    if (day < since) return null
    const u = r.message.usage
    const price = usd(u, r.message.model)
    if (!price) {
      unpriced++
      return null
    }
    const t = tokens(u)
    const ctx = thread === 'main' ? contextBucket(u) : ''
    const key = [day, project, family(r.message.model), r.effort ?? 'unknown', thread, ctx].join('|')
    const x = row(key)
    x.requests++
    for (const k of KINDS) x[k] += t[k]
    for (const k of ['input', 'cacheWrite', 'cacheRead', 'output', 'search']) x.usd[k] += price[k]
    x.thinking += t.thinking
    x.searches += t.searches
    hour(r.timestamp, price.total)
    return { key, at: r.timestamp, usd: price.total }
  }
  // A summary compaction: where its estimate would go (estimated in lib/prices.mjs).
  const summaryAt = (s, project) => {
    if (!s.timestamp || Number.isNaN(Date.parse(s.timestamp)) || localDay(s.timestamp) < since) return null
    const c = summaryUsd(s.preTokens, s.chars, s.last.message.model)
    if (!c) return null
    const key = [localDay(s.timestamp), project, family(s.last.message.model), s.last.effort ?? 'unknown', 'main', contextBucket({ cache_read_input_tokens: s.preTokens })].join('|')
    return { key, at: s.timestamp, usd: c }
  }

  for (const { file, project: dir } of sessionFiles(configDir, { days })) {
    // A readable name: the folder without the home prefix or a usual parent; scratch and temp folders as one.
    const project = /^-private-|^-tmp-|^-var-folders-/.test(dir) ? 'temporary folders' : dir.replace(home, '').replace(/^(Documents|Desktop|Projects|projects|code|src|dev|work|repos)-/, '') || dir
    const { list: main, summaries, states, firstAt } = responses(readFileSync(file, 'utf8'))
    let spent = 0
    let first = ''
    const placed = []
    for (const r of main) {
      const p = add(r, project, r.isSidechain ? 'sidechain' : 'main')
      if (p) {
        spent += p.usd
        if (!r.isSidechain) placed.push(p)
      }
      if (!first || r.timestamp < first) first = r.timestamp
    }
    let agents = 0
    for (const { path, type } of subagentFiles(file)) {
      const { list: got } = responses(readFileSync(path, 'utf8'))
      if (!got.length) continue
      agents++
      for (const r of got) spent += add(r, project, `agent:${type}`)?.usd ?? 0
    }
    // What Claude Code billed beyond these responses: its own total where it holds, else the summaries'
    // estimate; put where the summaries were, or spread over the main thread when there were none. A
    // period that starts mid-session leaves Claude Code's total aside, as it covers the whole session.
    const marks = summaries.map((s) => summaryAt(s, project)).filter(Boolean)
    const estimate = marks.reduce((a, m) => a + m.usd, 0)
    const whole = !since || localDay(firstAt || Date.parse(first)) >= since
    const h = hiddenUsd(whole ? ownTotal(states, firstAt) : null, spent, estimate)
    if (h.from === 'claude code') own++
    const over = marks.length ? marks : placed
    const weight = over.reduce((a, m) => a + m.usd, 0)
    if (h.usd > 0 && weight > 0) {
      for (const m of over) {
        const c = (h.usd * m.usd) / weight
        const x = row(m.key)
        x.usd.hidden += c
        hour(m.at, c)
      }
      for (const m of marks) row(m.key).summaries++
      spent += h.usd
    }
    runs += agents
    if (spent > 0) sessions.push({ id: file.split('/').pop().replace(/\.jsonl$/, '').slice(0, 8), project, day: localDay(first || Date.now()), requests: main.length, agents, usd: spent })
  }

  sessions.sort((a, b) => b.usd - a.usd)
  return {
    generated: new Date().toISOString(),
    days: days ?? null,
    units: `Dollars at the Claude API's list price of each model (${PRICES.source}, read ${PRICES.checked}); on a Pro or Max plan, what the same work would cost on the API, not what it took from the plan's limits. Requests Claude Code makes that its transcripts leave out (a summary compaction's own request, titles, page reads for WebFetch) are taken from its own session total where it holds, else estimated`,
    ownTotals: own,
    prices: PRICES,
    unpriced,
    fields: ['day', 'project', 'model', 'effort', 'thread', 'context'],
    rows: [...rows].map(([k, v]) => [...k.split('|'), v]),
    hours,
    sessions: sessions.slice(0, 400),
    runs,
  }
}

export const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'dashboard.html')

const font = (name) => {
  const file = join(dirname(TEMPLATE), 'fonts', name)
  return existsSync(file) ? `url(data:font/woff2;base64,${readFileSync(file).toString('base64')}) format('woff2')` : 'local("none")'
}

/**
 * The template with the data and its two fonts in place, so the page needs no network. `</` in the
 * data is escaped so it cannot close the script.
 */
export function render(data, template = readFileSync(TEMPLATE, 'utf8')) {
  return template
    .replace('/*__FONT_SANS__*/', font('inter.woff2'))
    .replace('/*__FONT_HEADING__*/', font('dm-sans.woff2'))
    .replace('/*__TOKENDOCTOR_DATA__*/null', JSON.stringify(data).replace(/</g, '\\u003c'))
}
