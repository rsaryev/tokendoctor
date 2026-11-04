// What a request costs at the Claude API's list prices, by model, from the usage Claude Code records
// with each response. Source: https://platform.claude.com/docs/en/about-claude/pricing, read
// 2026-11-04. These are API prices: a Pro or Max plan's limits are not published per kind of token,
// so on a plan this is what the same work would cost on the API, not what it took from the plan.

export const PRICES = { source: 'https://platform.claude.com/docs/en/about-claude/pricing', checked: '2026-11-04' }

// Per model: base input and output in $ per million tokens, and what a cache read costs as a share of
// base input. Cache writes are 1.25x base input (5-minute) and 2x (1-hour) on every model.
const MODELS = {
  'fable-5.1': { input: 10, output: 50, read: 0.025 },
  'mythos-5.1': { input: 10, output: 50, read: 0.025 },
  'fable-5': { input: 10, output: 50, read: 0.1 },
  'mythos-5': { input: 10, output: 50, read: 0.1 },
  'opus-5.5': { input: 4, output: 20, read: 0.05, fast: { input: 8, output: 40 } },
  'opus-5': { input: 5, output: 25, read: 0.1, fast: { input: 10, output: 50 } },
  'opus-4.8': { input: 5, output: 25, read: 0.1, fast: { input: 10, output: 50 } },
  'opus-4.7': { input: 5, output: 25, read: 0.1 },
  'opus-4.6': { input: 5, output: 25, read: 0.1 },
  'opus-4.5': { input: 5, output: 25, read: 0.1 },
  'opus-4.1': { input: 15, output: 75, read: 0.1 },
  'opus-4': { input: 15, output: 75, read: 0.1 },
  'sonnet-5.5': { input: 2, output: 10, read: 0.05 },
  'sonnet-5': { input: 2, output: 10, read: 0.1 },
  'sonnet-4.6': { input: 3, output: 15, read: 0.1 },
  'sonnet-4.5': { input: 3, output: 15, read: 0.1 },
  'sonnet-4': { input: 3, output: 15, read: 0.1 },
  // Priced by prompt length: a request whose prompt (input, cache reads and writes) is over 100,000
  // tokens pays the higher prices for all of it.
  'haiku-5.5': { input: 0.1, output: 0.5, read: 0.1, long: { over: 100_000, input: 0.5, output: 2.5 } },
  'haiku-4.5': { input: 1, output: 5, read: 0.1 },
}
// US-only inference (`inference_geo: "us"`) is 1.1x on every kind, for Claude 4.6 and later.
const GEO_US = new Set(['fable-5.1', 'mythos-5.1', 'fable-5', 'mythos-5', 'opus-5.5', 'opus-5', 'opus-4.8', 'opus-4.7', 'opus-4.6', 'sonnet-5.5', 'sonnet-5', 'sonnet-4.6', 'haiku-5.5'])
/** Web search: $10 per 1,000 searches, on top of tokens. Web fetch costs only its tokens. */
const SEARCH = 0.01

/** The table's key for a model id: 'claude-opus-5-5', 'claude-opus-4-5-20251101' or a Bedrock id → 'opus-5.5', 'opus-4.5'. */
export function modelKey(id = '') {
  const m = String(id).toLowerCase().replace(/-\d{8}.*$/, '').match(/(fable|mythos|opus|sonnet|haiku)-(\d+)(?:[-.](\d+))?(?![\d])/)
  if (!m) return null
  const key = m[3] === undefined ? `${m[1]}-${m[2]}` : `${m[1]}-${m[2]}.${m[3]}`
  return key in MODELS ? key : null
}

/**
 * One response's cost in dollars, by kind, at list price; null for a model the table does not have.
 * Reads `speed` (fast mode), `inference_geo` and `server_tool_use` where Claude Code recorded them.
 */
export function usd(usage, model) {
  const key = modelKey(model)
  if (!key || !usage) return null
  const p = MODELS[key]
  const w1 = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0
  const w5 = usage.cache_creation?.ephemeral_5m_input_tokens ?? Math.max(0, (usage.cache_creation_input_tokens ?? 0) - w1)
  const input = usage.input_tokens ?? 0
  const read = usage.cache_read_input_tokens ?? 0
  const prompt = input + read + w5 + w1
  let rate = p
  if (p.long && prompt > p.long.over) rate = p.long
  if (usage.speed === 'fast' && p.fast) rate = p.fast
  const geo = usage.inference_geo === 'us' && GEO_US.has(key) ? 1.1 : 1
  const per = (tokens, price) => (tokens * price * geo) / 1e6
  const out = {
    input: per(input, rate.input),
    cacheWrite: per(w5, rate.input * 1.25) + per(w1, rate.input * 2),
    cacheRead: per(read, rate.input * p.read),
    output: per(usage.output_tokens ?? 0, rate.output),
    search: (usage.server_tool_use?.web_search_requests ?? 0) * SEARCH,
  }
  out.total = out.input + out.cacheWrite + out.cacheRead + out.output + out.search
  return out
}

/** The prices replay needs for one request: $ per token for a cache read, a 5-minute and a 1-hour write, and output. */
export function rates(usage, model) {
  const key = modelKey(model)
  if (!key) return null
  const p = MODELS[key]
  const prompt = (usage?.input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0)
  let rate = p
  if (p.long && prompt > p.long.over) rate = p.long
  if (usage?.speed === 'fast' && p.fast) rate = p.fast
  const geo = usage?.inference_geo === 'us' && GEO_US.has(key) ? 1.1 : 1
  return { read: (rate.input * p.read * geo) / 1e6, w5: (rate.input * 1.25 * geo) / 1e6, w1: (rate.input * 2 * geo) / 1e6, output: (rate.output * geo) / 1e6 }
}

/** Characters per token, for a summary's length where the tokens are not recorded. */
const CHARS_PER_TOKEN = 3.5

/**
 * An estimate of a summary compaction's own request, which Claude Code bills but does not write to the
 * transcript: it reads the context it summarizes (`preTokens`, from the compact_boundary entry) and
 * writes the summary. On bench/'s runs it brings the transcript's cost within about 1% of what Claude
 * Code reported (median), against 9% under without it.
 */
export function summaryUsd(preTokens, summaryChars, model) {
  const r = rates({ cache_read_input_tokens: preTokens }, model)
  if (!r) return 0
  return preTokens * r.read + (summaryChars / CHARS_PER_TOKEN) * r.output
}

/**
 * Claude Code's own total for one session at list prices, from the `cost-state` lines it writes into
 * the transcript, or null where that total cannot be taken as this session's: no such line, a model it
 * had no price for, a total that fell (a restart that counted from zero again), or a process that did
 * not start within two minutes of the session's first line (after /clear it can carry the session
 * before; after --resume it counts only from the resume). `firstAt` is the first line's time in ms.
 */
export function ownTotal(states, firstAt) {
  if (!states?.length || !Number.isFinite(firstAt)) return null
  for (let i = 1; i < states.length; i++) if (!(states[i].totalCostUSD >= states[i - 1].totalCostUSD - 1e-9)) return null
  const last = states.at(-1)
  if (last.hasUnknownModelCost || typeof last.totalCostUSD !== 'number') return null
  const start = states[0].startTime
  if (typeof start !== 'number' || Math.abs(firstAt - start) > 120_000) return null
  return last.totalCostUSD
}

/**
 * What Claude Code billed for a session beyond the responses in its transcripts (the main one and its
 * subagents'): a summary compaction's own request, session titles, the small model that reads a page
 * for WebFetch. Taken from Claude Code's own total where it holds (`ownTotal`), else the summaries'
 * estimate. `from` says which.
 */
export function hiddenUsd(own, responses, estimate) {
  if (own != null && own >= responses - 0.01) return { usd: Math.max(0, own - responses), from: 'claude code' }
  return { usd: estimate, from: 'estimate' }
}
