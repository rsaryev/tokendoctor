// Before/after snapshots of token use, one JSON file per machine and period, so a settings change
// can be judged on the same measures later and across machines. A snapshot holds totals and
// daily rows only: no project names, paths or session ids, so it can be shared or committed.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { daily, summarize, topModelCost as top } from './sessions.mjs'

export const BENCH_VERSION = 1

// Pure: sessions in, the snapshot's measured part out.
export function measure(sessions) {
  const { totals: t } = summarize(sessions)
  const pre = t.compactions.map((c) => c.preTokens).filter(Boolean)
  const days = daily(sessions).map(({ date, cost, mainCost, bigContextCost, turns, sessions: n, byModel }) => ({
    date, cost, mainCost, bigContextCost, turns, sessions: n, byModel,
  }))
  return {
    totals: {
      sessions: t.sessions,
      activeDays: days.length,
      turns: t.turns,
      subagentRuns: Object.values(t.agents).reduce((n, a) => n + a.runs, 0),
      cost: t.cost,
      mainCost: t.mainCost,
      contextTokens: t.contextTokens,
      bigContextCost: t.bigContextCost,
      output: t.output,
      thinking: t.thinking,
      compactions: t.compactions.length,
      compactPreTokens: pre.reduce((a, b) => a + b, 0),
      compactsMeasured: pre.length,
      byModel: t.byModel,
      agents: t.agents,
      rebuilds: t.rebuilds,
    },
    days,
  }
}

const sum = (a = {}, b = {}) => {
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v
  return out
}

// Pure: adds totals of several snapshots (two machines, say) into one.
export function combine(list) {
  const t = {}
  for (const x of list) {
    for (const [k, v] of Object.entries(x)) {
      if (typeof v === 'number') t[k] = (t[k] ?? 0) + v
      else if (k === 'byModel') t.byModel = sum(t.byModel, v)
      else if (k === 'agents' || k === 'rebuilds') {
        t[k] ??= {}
        for (const [name, e] of Object.entries(v)) {
          const y = (t[k][name] ??= {})
          for (const [f, n] of Object.entries(e)) y[f] = f === 'byModel' ? sum(y.byModel, n) : (y[f] ?? 0) + n
        }
      }
    }
  }
  return t
}

const ratio = (a, b) => (b ? a / b : null)

// The measures a before/after comparison reads, each normalised so that a busier week does not
// look worse by itself. `better` says which direction is an improvement.
export const MEASURES = [
  { key: 'costPerTurn', label: 'cost per main turn, K IE', better: 'lower', unit: 'k',
    of: (t) => ratio(t.cost, t.turns) },
  { key: 'costPerDay', label: 'cost per active day, M IE', better: 'lower', unit: 'M',
    of: (t) => ratio(t.cost, t.activeDays) },
  { key: 'avgContext', label: 'context per main turn, K tokens', better: 'lower', unit: 'k',
    of: (t) => ratio(t.contextTokens, t.turns) },
  { key: 'bigContextShare', label: 'main cost with >400K in context', better: 'lower', unit: '%',
    of: (t) => ratio(t.bigContextCost, t.mainCost) },
  { key: 'avgCompactAt', label: 'compaction point, K tokens', better: 'lower', unit: 'k',
    of: (t) => ratio(t.compactPreTokens, t.compactsMeasured) },
  { key: 'subagentShare', label: 'subagents, share of all cost', better: null, unit: '%',
    of: (t) => ratio(t.cost - t.mainCost, t.cost) },
  { key: 'subagentTopModel', label: 'subagent cost on Opus/Fable', better: 'lower', unit: '%',
    of: (t) => ratio(Object.values(t.agents ?? {}).reduce((n, a) => n + top(a.byModel), 0), t.cost - t.mainCost) },
  { key: 'mainTopModel', label: 'main cost on Opus/Fable', better: null, unit: '%',
    of: (t) => ratio(top(t.byModel), t.mainCost) },
  { key: 'idleRebuildShare', label: 'cache rebuilds after idle, share', better: 'lower', unit: '%',
    of: (t) => ratio(t.rebuilds?.['idle past the cache TTL']?.cost ?? 0, t.cost) },
  { key: 'thinkingShare', label: 'thinking, share of output tokens', better: null, unit: '%',
    of: (t) => ratio(t.thinking, t.output) },
]

export const measures = (t) => Object.fromEntries(MEASURES.map((m) => [m.key, m.of(t)]))

export const fileName = (s) => `${s.machine}-${s.label}-${s.period.since}_${s.period.until}.json`.replace(/[^A-Za-z0-9._-]/g, '-')

export function readSnapshots(dir) {
  let names
  try {
    names = readdirSync(dir).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }
  return names
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(dir, f), 'utf8'))
      } catch {
        return null
      }
    })
    .filter((s) => s?.bench === BENCH_VERSION)
    .sort((a, b) => (a.period.since < b.period.since ? -1 : 1))
}

// Pure: snapshots in, one column per label (in period order) for each machine and, when there
// is more than one machine, for all of them added together.
export function compare(snapshots) {
  const labels = [...new Set(snapshots.map((s) => s.label))]
  const group = (list) =>
    labels
      .map((label) => {
        const of = list.filter((s) => s.label === label)
        if (!of.length) return null
        const totals = combine(of.map((s) => s.totals))
        return {
          label,
          since: of.map((s) => s.period.since).sort()[0],
          until: of.map((s) => s.period.until).sort().at(-1),
          totals,
          measures: measures(totals),
        }
      })
      .filter(Boolean)
  const machines = [...new Set(snapshots.map((s) => s.machine))]
  const out = machines.map((machine) => ({ machine, columns: group(snapshots.filter((s) => s.machine === machine)) }))
  if (machines.length > 1) out.push({ machine: 'all machines', columns: group(snapshots) })
  return out
}
