import assert from 'node:assert/strict'
import { test } from 'node:test'
import { leftAfterCompaction, replay, request, RESERVE, W } from '../lib/replay.mjs'

// A session that grows by 10K a request from 30K, read from the cache, 500 tokens out each.
const growing = (n, step = 10_000, start = 30_000) =>
  Array.from({ length: n }, (_, i) => ({ context: start + i * step, output: 500, cost: (start + i * step) * W.read + 500 * W.out, writeWeight: W.w1 }))

test('a window the session never reaches changes nothing', () => {
  const r = replay(growing(50), 1_000_000)
  assert.equal(r.compactions, 0)
  assert.equal(r.replayed, r.real)
})

test('a smaller window compacts where the session passes it, and costs less over a long session', () => {
  const s = growing(90) // 30K to 920K
  const r = replay(s, 400_000, 40_000)
  // From 40K, 10K a request: past 367K every 33 requests or so.
  assert.equal(r.compactions, 2)
  assert.ok(r.peak <= 400_000 - RESERVE + 10_000)
  assert.ok(r.replayed < r.real * 0.6, `${r.replayed} vs ${r.real}`)
})

test('a compaction is not free: just past the point it costs more than it saves', () => {
  const s = growing(36) // to 380K: one compaction near the end
  const r = replay(s, 400_000, 40_000)
  assert.equal(r.compactions, 1)
  assert.ok(r.replayed > r.real)
})

test('a real compaction compacts the replayed session too', () => {
  const s = [...growing(40), ...growing(10, 10_000, 35_000)]
  const r = replay(s, 1_000_000)
  assert.equal(r.replayed, r.real)
  assert.equal(leftAfterCompaction(s), 35_000)
})

test('a request is read from its usage as the API reports it', () => {
  const r = request({ input_tokens: 10, cache_read_input_tokens: 1000, cache_creation_input_tokens: 200, cache_creation: { ephemeral_1h_input_tokens: 200 }, output_tokens: 50 })
  assert.equal(r.context, 1210)
  assert.equal(r.cost, 10 + 100 + 400 + 250)
  assert.equal(r.writeWeight, W.w1)
})
