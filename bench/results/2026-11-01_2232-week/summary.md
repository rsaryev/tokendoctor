# week, 2026-11-01 22:32

slide v5 against the fixed baselines

307 tests in 27 steps of one session; claude-haiku-5-5; window each profile's own; 1800 s a run; runs an arm: 2; 2.1.316 (Claude Code); Darwin arm64 26.6.2, load 7.5.

| arm | what |
|---|---|
| advised+slide | every fix tokendoctor's audit offers applied; the slide down to 25%; tokendoctor 0.4.1 f164c95-dirty |

| arm | run | solved | pass | wall s | cost $ | requests | cache % | max context | compactions | summaries | slides | compact s | reads | re-reads | edits | failed tools | tampered | status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| advised+slide | 0 | yes | 307/307 | 1795.5 | 3.7276 | 211 | 99 | 359K | 1 | 0 | 1 | 0 | 4 | 0 | 116 | 4 | 0 | success |
| advised+slide | 1 | yes | 307/307 | 1301.8 | 1.9213 | 96 | 97 | 366K | 1 | 0 | 1 | 0 | 7 | 0 | 119 | 22 | 0 | success |

Against the baselines (medians):

| arm | runs | cost | time | cost change | time change |
|---|---|---|---|---|---|
| factory (baseline, [2026-11-01_1819-week](../2026-11-01_1819-week/summary.md)) | 3 | $3.1782 | 1395 s |  |  |
| advised (baseline, [2026-11-01_1819-week](../2026-11-01_1819-week/summary.md)) | 3 | $2.8765 | 1623.6 s |  |  |
| advised+slide | 2 | $2.8244 | 1548.65 s | −11% vs factory, −2% vs advised | +11% vs factory, −5% vs advised |

Advice applied: compact-window-unset, explore-default-model, subagent-model-unset, no-statusline.

| arm | run | step 1 | step 2 | step 3 | step 4 | step 5 | step 6 | step 7 | step 8 | step 9 | step 10 | step 11 | step 12 | step 13 | step 14 | step 15 | step 16 | step 17 | step 18 | step 19 | step 20 | step 21 | step 22 | step 23 | step 24 | step 25 | step 26 | step 27 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| advised+slide | 0 | 27 (54.8 s) | 69 (103.4 s) | 141 (207 s) | 214 (232.1 s) | 261 (87.6 s) | 307 (70.3 s) | 307 (13.1 s) | 307 (99.3 s) | 307 (62.1 s) | 307 (91.6 s) | 307 (7.1 s) | 307 (47.5 s) | 307 (49.2 s) | 307 (83.4 s) | 307 (7.1 s) | 307 (76.4 s) | 307 (80.6 s) | 307 (6.8 s) | 307 (101 s) | 307 (30.9 s) | 307 (8.3 s) | 307 (79.9 s) | 307 (75.9 s) | 307 (8.5 s) | 307 (53.9 s) | 307 (51.5 s) | 307 (6 s) |
| advised+slide | 1 | 27 (51.3 s) | 69 (108.3 s) | 141 (191.2 s) | 214 (215.4 s) | 261 (92.7 s) | 307 (70.4 s) | 307 (13.6 s) | 307 (66.2 s) | 307 (48.9 s) | 307 (60.3 s) | 307 (6.8 s) | 307 (31.7 s) | 307 (46 s) | 307 (52.8 s) | 307 (8.7 s) | 307 (37.6 s) | 307 (25.4 s) | 307 (5.9 s) | 307 (29.8 s) | 307 (25.2 s) | 307 (5.8 s) | 307 (20.8 s) | 307 (24.4 s) | 307 (7.1 s) | 307 (26.2 s) | 307 (22.5 s) | 307 (6.8 s) |

Each run's logs are in its directory: `events.jsonl.gz` (Claude Code's stream), `transcript.jsonl.gz` (the session as Claude Code kept it), `test.txt.gz` (`bun test` after the fixed files were restored), `src.tar.gz` (the code) and `answer.md` (its last words).
