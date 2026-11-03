# workday, 2026-11-03 22:14

reads on: Bash prints of files sent to Read, slide v5; compare with 2026-11-01_2207-workday (factory+slide, same window) and the factory baseline

307 tests in 7 steps of one session; claude-haiku-5-5; window 100K; 1800 s a run; runs an arm: 2; 2.1.317 (Claude Code); Darwin arm64 26.6.2, load 3.9.

| arm | what |
|---|---|
| factory+slide+reads | Claude Code as it ships, empty config; the slide down to 25%; Bash prints of files sent to Read; tokendoctor 0.4.1 f416dd5-dirty |

| arm | run | solved | pass | wall s | cost $ | requests | cache % | max context | compactions | summaries | slides | compact s | reads | re-reads | edits | failed tools | tampered | status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| factory+slide+reads | 0 | yes | 307/307 | 988.1 | 0.1992 | 56 | 88 | 66K | 6 | 0 | 6 | 0.1 | 20 | 5 | 15 | 26 | 0 | success |
| factory+slide+reads | 1 | yes | 307/307 | 823.2 | 0.1743 | 46 | 88 | 64K | 5 | 0 | 5 | 0.1 | 20 | 7 | 13 | 18 | 0 | success |

Against the baselines (medians):

| arm | runs | cost | time | cost change | time change |
|---|---|---|---|---|---|
| factory (baseline, [2026-11-01_1750-workday](../2026-11-01_1750-workday/summary.md)) | 2 | $0.1861 | 1141.35 s |  |  |
| factory+slide+reads | 2 | $0.1868 | 905.65 s | +0% vs factory | −21% vs factory |

| arm | run | step 1 | step 2 | step 3 | step 4 | step 5 | step 6 | step 7 |
|---|---|---|---|---|---|---|---|---|
| factory+slide+reads | 0 | 27 (50.6 s) | 69 (151 s) | 141 (184.2 s) | 214 (424 s) | 261 (89.3 s) | 307 (76.2 s) | 307 (12.8 s) |
| factory+slide+reads | 1 | 27 (45.9 s) | 69 (111.2 s) | 141 (169.8 s) | 214 (259.3 s) | 261 (152.3 s) | 307 (76 s) | 307 (8.7 s) |

Each run's logs are in its directory: `events.jsonl.gz` (Claude Code's stream), `transcript.jsonl.gz` (the session as Claude Code kept it), `test.txt.gz` (`bun test` after the fixed files were restored), `src.tar.gz` (the code) and `answer.md` (its last words).
