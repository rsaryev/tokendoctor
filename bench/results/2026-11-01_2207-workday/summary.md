# workday, 2026-11-01 22:07

slide v5: thinking and images count as freed, floor 60% of the window without calibration, afterSlide reset after a summary

307 tests in 7 steps of one session; claude-haiku-5-5; window 100K; 1800 s a run; runs an arm: 2; 2.1.316 (Claude Code); Darwin arm64 26.6.2, load 2.4.

| arm | what |
|---|---|
| factory+slide | Claude Code as it ships, empty config; the slide down to 25%; tokendoctor 0.4.1 f164c95-dirty |

| arm | run | solved | pass | wall s | cost $ | requests | cache % | max context | compactions | summaries | slides | compact s | reads | re-reads | edits | failed tools | tampered | status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| factory+slide | 0 | yes | 307/307 | 747.5 | 0.1474 | 38 | 85 | 62K | 5 | 0 | 5 | 0 | 0 | 0 | 13 | 0 | 0 | success |
| factory+slide | 1 | yes | 307/307 | 777.5 | 0.1544 | 47 | 87 | 68K | 5 | 0 | 5 | 0.1 | 3 | 0 | 15 | 11 | 0 | success |

Against the baselines (medians):

| arm | runs | cost | time | cost change | time change |
|---|---|---|---|---|---|
| factory (baseline, [2026-11-01_1750-workday](../2026-11-01_1750-workday/summary.md)) | 2 | $0.1861 | 1141.35 s |  |  |
| factory+slide | 2 | $0.1509 | 762.5 s | −19% vs factory | −33% vs factory |

| arm | run | step 1 | step 2 | step 3 | step 4 | step 5 | step 6 | step 7 |
|---|---|---|---|---|---|---|---|---|
| factory+slide | 0 | 27 (57.6 s) | 69 (82.1 s) | 141 (187.5 s) | 214 (250 s) | 261 (95.1 s) | 307 (67.2 s) | 307 (8 s) |
| factory+slide | 1 | 27 (59.9 s) | 69 (105.1 s) | 141 (216.5 s) | 214 (218.3 s) | 261 (84.5 s) | 307 (85.5 s) | 307 (7.7 s) |

Each run's logs are in its directory: `events.jsonl.gz` (Claude Code's stream), `transcript.jsonl.gz` (the session as Claude Code kept it), `test.txt.gz` (`bun test` after the fixed files were restored), `src.tar.gz` (the code) and `answer.md` (its last words).
