// What a session would have cost with a smaller compaction window, replayed request by request from
// its transcript. Pure; costs in dollars at each request's model list price (lib/prices.mjs).
//
// The main conversation's requests are taken as they were, but the context each one carried is
// recomputed: it grows by what the real one grew, and where it passes the window's compaction point
// (the window less Claude Code's ~33K reserve) it is compacted to the size real compactions left
// behind. A compaction costs what one does: a request that reads the whole context and writes a
// summary, and the cache written again for the request after it. A real compaction in the session
// compacts the replayed one too. What this cannot know: the work a model does again after a summary
// it would not have needed (the re-reads), which the live benchmark (bench/) measures.

import { rates, usd } from './prices.mjs'

/** What Claude Code keeps free below the window: the answer's and the summary's room. */
export const RESERVE = 33_000
/** A summary's length in output tokens, where the transcript shows none. */
const SUMMARY_OUT = 6_000

/**
 * One request as replay reads it: the context it carried, its output, its real cost, and its model's
 * prices per token (a cache read, the cache write it used, output). A model lib/prices.mjs does not
 * have costs nothing and saves nothing.
 */
export function request(u, model) {
  const w1 = u.cache_creation?.ephemeral_1h_input_tokens ?? 0
  const write = u.cache_creation_input_tokens ?? 0
  const context = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + write
  const r = rates(u, model) ?? { read: 0, w5: 0, w1: 0, output: 0 }
  return { context, output: u.output_tokens ?? 0, cost: usd(u, model)?.total ?? 0, read: r.read, write: w1 ? r.w1 : r.w5, out: r.output }
}

/**
 * The session's requests (in order) replayed with compaction at `window`. `after` is the context a
 * compaction leaves (the session's own, where it compacted; else its first request's and a summary).
 */
export function replay(requests, window, after) {
  const point = window - RESERVE
  const first = requests[0]?.context ?? 0
  const left = after ?? first + 8_000
  let real = 0
  let replayed = 0
  let context = 0
  let previous = 0
  let compactions = 0
  let peak = 0
  for (const r of requests) {
    real += r.cost
    const grew = r.context - previous
    // The real session compacted (or its cache rebuilt smaller): the replayed one is no larger.
    context = grew >= 0 ? context + grew : Math.min(context, r.context)
    if (!previous) context = r.context
    previous = r.context
    let extra = 0
    if (context > point && r.context > point) {
      // A compaction here: the summary request reads what there is, the next writes what is left.
      compactions++
      extra += context * r.read + SUMMARY_OUT * r.out + left * r.write
      context = left
    }
    const saved = Math.max(0, r.context - context) * r.read
    replayed += r.cost - saved + extra
    peak = Math.max(peak, context)
  }
  return { real, replayed, compactions, peak }
}

/** The context real compactions left in this session: the first request after each drop. */
export function leftAfterCompaction(requests) {
  const after = []
  for (let i = 1; i < requests.length; i++) {
    const before = requests[i - 1].context
    if (before > 100_000 && requests[i].context < before / 3) after.push(requests[i].context)
  }
  if (!after.length) return undefined
  return after.sort((a, b) => a - b)[Math.floor(after.length / 2)]
}

/** Every session replayed at each window: the real cost, the replayed, and the sessions it touches. */
export function replayAll(sessions, windows) {
  return windows.map((window) => {
    const t = { window, sessions: 0, touched: 0, real: 0, replayed: 0, compactions: 0 }
    for (const requests of sessions) {
      if (!requests.length) continue
      const r = replay(requests, window, leftAfterCompaction(requests))
      t.sessions++
      t.real += r.real
      t.replayed += r.replayed
      t.compactions += r.compactions
      if (r.compactions) t.touched++
    }
    t.saved = t.real ? 1 - t.replayed / t.real : 0
    return t
  })
}
