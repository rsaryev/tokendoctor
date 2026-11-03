# workday, 2026-11-03 22:33

slide v6: Bash prints of files count as reads (stale ones go first); the refusal (reads option) removed. Compare with 2026-11-01_2207-workday (slide v5) and 2026-11-03_2214-workday (v5 + refusals)

307 tests in 7 steps of one session; claude-haiku-5-5; window 100K; 1800 s a run; runs an arm: 2; 2.1.317 (Claude Code); Darwin arm64 26.6.2, load 4.1.

| arm | what |
|---|---|
| factory+slide | Claude Code as it ships, empty config; the slide down to 25%; tokendoctor 0.4.1 f416dd5-dirty |

| arm | run | solved | pass | wall s | cost $ | requests | cache % | max context | compactions | summaries | slides | compact s | reads | re-reads | edits | failed tools | tampered | status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| factory+slide | 0 | yes | 307/307 | 687.9 | 0.1422 | 47 | 89 | 65K | 4 | 0 | 4 | 0 | 0 | 0 | 14 | 0 | 0 | success |
| factory+slide | 1 | yes | 307/307 | 941 | 0.1744 | 44 | 87 | 65K | 5 | 1 | 4 | 23.1 | 10 | 0 | 12 | 0 | 0 | success |

Against the baselines (medians):

| arm | runs | cost | time | cost change | time change |
|---|---|---|---|---|---|
| factory (baseline, [2026-11-01_1750-workday](../2026-11-01_1750-workday/summary.md)) | 2 | $0.1861 | 1141.35 s |  |  |
| factory+slide | 2 | $0.1583 | 814.45 s | −15% vs factory | −29% vs factory |

| arm | run | step 1 | step 2 | step 3 | step 4 | step 5 | step 6 | step 7 |
|---|---|---|---|---|---|---|---|---|
| factory+slide | 0 | 27 (53.2 s) | 69 (68.7 s) | 141 (201.4 s) | 214 (221 s) | 261 (79.4 s) | 307 (55.7 s) | 307 (8.5 s) |
| factory+slide | 1 | 27 (68.9 s) | 69 (105.8 s) | 141 (356.1 s) | 214 (258.4 s) | 261 (76.6 s) | 307 (67.8 s) | 307 (7.5 s) |

Each run's logs are in its directory: `events.jsonl.gz` (Claude Code's stream), `transcript.jsonl.gz` (the session as Claude Code kept it), `test.txt.gz` (`bun test` after the fixed files were restored), `src.tar.gz` (the code) and `answer.md` (its last words).
