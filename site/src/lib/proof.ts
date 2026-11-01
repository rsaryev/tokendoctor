/**
 * The numbers the landing's proof stands on: the author's own Claude Code use over six weeks, read
 * from local transcripts (benchmark and temporary folders left out), and the benchmark in bench/.
 * Shares and tokens only, no money. Made again with the scripts in bench/; see bench/README.md.
 */

/** The day the compaction window went from Claude Code's 1M to 400K, as the transcripts show it. */
export const SWITCH_DAY = '2026-10-25'

/** Each day's mean context per request, in thousands of tokens (days under 50 requests left out). */
export const DAILY: { day: string; context: number; requests: number }[] = [
  { day: '2026-09-22', requests: 766, context: 459 },
  { day: '2026-09-23', requests: 357, context: 386 },
  { day: '2026-09-24', requests: 1413, context: 387 },
  { day: '2026-09-25', requests: 1194, context: 370 },
  { day: '2026-09-26', requests: 833, context: 560 },
  { day: '2026-09-27', requests: 821, context: 560 },
  { day: '2026-09-28', requests: 305, context: 169 },
  { day: '2026-09-29', requests: 1160, context: 417 },
  { day: '2026-09-30', requests: 1025, context: 372 },
  { day: '2026-10-01', requests: 1225, context: 425 },
  { day: '2026-10-02', requests: 653, context: 459 },
  { day: '2026-10-03', requests: 1319, context: 385 },
  { day: '2026-10-04', requests: 1568, context: 379 },
  { day: '2026-10-05', requests: 744, context: 399 },
  { day: '2026-10-09', requests: 146, context: 236 },
  { day: '2026-10-10', requests: 608, context: 356 },
  { day: '2026-10-11', requests: 1039, context: 337 },
  { day: '2026-10-16', requests: 630, context: 260 },
  { day: '2026-10-17', requests: 684, context: 348 },
  { day: '2026-10-18', requests: 2706, context: 424 },
  { day: '2026-10-19', requests: 1276, context: 444 },
  { day: '2026-10-20', requests: 1622, context: 486 },
  { day: '2026-10-21', requests: 1394, context: 460 },
  { day: '2026-10-22', requests: 2177, context: 444 },
  { day: '2026-10-23', requests: 2430, context: 460 },
  { day: '2026-10-24', requests: 743, context: 515 },
  { day: '2026-10-25', requests: 3285, context: 211 },
  { day: '2026-10-26', requests: 2264, context: 226 },
  { day: '2026-10-27', requests: 1948, context: 208 },
  { day: '2026-10-28', requests: 3173, context: 224 },
  { day: '2026-10-29', requests: 1779, context: 210 },
  { day: '2026-10-30', requests: 318, context: 214 },
  { day: '2026-10-31', requests: 3213, context: 228 },
  { day: '2026-11-01', requests: 1606, context: 218 },
]

/** Each period's mean over all its requests (not the mean of the days): the dashed lines. */
export const MEANS = [
  { from: '2026-09-22', to: '2026-10-21', context: 412, label: 'month before: 412K', at: '2026-10-13' },
  { from: '2026-10-25', to: '2026-11-01', context: 219, label: 'after: 219K', at: '2026-11-01' },
]

/** The headline figures, each with what it is and where it comes from. */
export const FIGURES = [
  {
    value: '−43%',
    label: 'cost per request',
    detail: 'month before vs. week after',
  },
  {
    value: '−47%',
    label: 'context per request',
    detail: '412K → 219K tokens',
  },
  {
    value: '−27 to −40%',
    label: 'same sessions, replayed',
    detail: 'only the window changed',
  },
]

/** The slide against Claude Code's summary, on bench/'s day of work (Haiku 5.5, 100K window). */
export const SLIDE = [
  { value: '< 1 s', label: 'per compaction', detail: 'a summary takes 73 s' },
  { value: '−19%', label: 'cost', detail: 'same work, all tests pass' },
  { value: '−33%', label: 'time', detail: 'nothing read again' },
]
