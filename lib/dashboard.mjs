// Every request in the local transcripts, rolled up for templates/dashboard.html: by day, project,
// model, effort, main thread or subagent type, and (main thread) context size, with the tokens split
// by kind. Reads usage figures, timestamps and agent types; never message text.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cost, family, localDay, sessionFiles } from './sessions.mjs'

export const KINDS = ['input', 'cacheWrite', 'cacheRead', 'output']
const CONTEXT = [[0, '<100K'], [100e3, '100–200K'], [200e3, '200–400K'], [400e3, '400K+']]

// Assistant responses in a transcript, once each: a streamed response repeats its message.id.
function responses(text) {
  const byId = new Map()
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
      }
    }
    at = end + 1
  }
  return [...byId.values()]
}

function tokens(u) {
  const w1 = u.cache_creation?.ephemeral_1h_input_tokens ?? 0
  const w5 = u.cache_creation?.ephemeral_5m_input_tokens ?? Math.max(0, (u.cache_creation_input_tokens ?? 0) - w1)
  return {
    input: u.input_tokens ?? 0,
    cacheWrite: w5 + w1,
    cacheRead: u.cache_read_input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    thinking: u.output_tokens_details?.thinking_tokens ?? 0,
    // What each kind adds to the cost, in input-token equivalents.
    ie: { input: u.input_tokens ?? 0, cacheWrite: w5 * 1.25 + w1 * 2, cacheRead: (u.cache_read_input_tokens ?? 0) * 0.1, output: (u.output_tokens ?? 0) * 5 },
  }
}

const contextBucket = (u) => {
  const n = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
  return CONTEXT.filter(([lo]) => n >= lo).at(-1)[1]
}

/**
 * Rows keyed by day|project|model|effort|thread|context, each with requests, tokens by kind, thinking
 * and IE by kind; plus IE by day and hour, and one line per session. `days` limits by file age.
 */
export function collect(configDir, { days } = {}) {
  const home = homedir().replace(/[^A-Za-z0-9]/g, '-') + '-'
  const rows = new Map()
  const hours = {}
  const sessions = []
  let runs = 0
  const since = days ? localDay(Date.now() - (days - 1) * 864e5) : ''

  const add = (r, project, thread) => {
    if (!r.timestamp || Number.isNaN(Date.parse(r.timestamp))) return 0
    const day = localDay(r.timestamp)
    if (day < since) return 0
    const u = r.message.usage
    const t = tokens(u)
    const ctx = thread === 'main' ? contextBucket(u) : ''
    const key = [day, project, family(r.message.model), r.effort ?? 'unknown', thread, ctx].join('|')
    const row = rows.get(key) ?? { requests: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, thinking: 0, ie: { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 } }
    row.requests++
    for (const k of KINDS) {
      row[k] += t[k]
      row.ie[k] += t.ie[k]
    }
    row.thinking += t.thinking
    rows.set(key, row)
    const hour = new Date(r.timestamp).getHours()
    const h = (hours[day] ??= Array(24).fill(0))
    const c = cost(u)
    h[hour] += c
    return c
  }

  for (const { file, project: dir } of sessionFiles(configDir, { days })) {
    // A readable name: the folder without the home prefix or a usual parent; scratch and temp folders as one.
    const project = /^-private-|^-tmp-|^-var-folders-/.test(dir) ? 'temporary folders' : dir.replace(home, '').replace(/^(Documents|Desktop|Projects|projects|code|src|dev|work|repos)-/, '') || dir
    const main = responses(readFileSync(file, 'utf8'))
    let ie = 0
    let first = ''
    for (const r of main) {
      ie += add(r, project, r.isSidechain ? 'sidechain' : 'main')
      if (!first || r.timestamp < first) first = r.timestamp
    }
    const sub = file.replace(/\.jsonl$/, '/subagents')
    let agents = 0
    if (existsSync(sub)) {
      for (const f of readdirSync(sub).filter((n) => n.endsWith('.jsonl'))) {
        let type = 'unknown'
        try {
          type = JSON.parse(readFileSync(join(sub, f.replace(/\.jsonl$/, '.meta.json')), 'utf8')).agentType ?? type
        } catch {}
        const got = responses(readFileSync(join(sub, f), 'utf8'))
        if (!got.length) continue
        agents++
        for (const r of got) ie += add(r, project, `agent:${type}`)
      }
    }
    runs += agents
    if (ie > 0) sessions.push({ id: file.split('/').pop().replace(/\.jsonl$/, '').slice(0, 8), project, day: localDay(first || Date.now()), requests: main.length, agents, ie })
  }

  sessions.sort((a, b) => b.ie - a.ie)
  return {
    generated: new Date().toISOString(),
    days: days ?? null,
    units: 'IE: input-token equivalents, the API\'s relative prices (input 1, cache read 0.1, 5-minute cache write 1.25, 1-hour 2, output 5); model prices are not applied',
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
