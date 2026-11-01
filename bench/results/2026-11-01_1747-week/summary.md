# week, 2026-11-01 17:47

pilot: a week of work, factory vs advised vs advised+slide

307 tests in 15 steps of one session; claude-haiku-5-5; window each profile's own; 1800 s a run; runs an arm: 1; 2.1.316 (Claude Code); Darwin arm64 26.6.2, load 1.8.

| arm | what |
|---|---|
| factory | Claude Code as it ships, empty config |
| advised | every fix tokendoctor's audit offers applied; tokendoctor 0.4.1 f164c95-dirty |
| advised+slide | every fix tokendoctor's audit offers applied; the slide down to 25%; tokendoctor 0.4.1 f164c95-dirty |

| arm | run | solved | pass | wall s | cost $ | requests | cache % | max context | compactions | summaries | slides | compact s | reads | re-reads | edits | failed tools | tampered | status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| factory | 0 | yes | 307/307 | 1032.7 | 1.5170 | 69 | 98 | 382K | 0 | 0 | 0 | 0 | 8 | 0 | 48 | 0 | 0 | success |
| advised | 0 | yes | 307/307 | 1072.8 | 1.6987 | 91 | 98 | 366K | 1 | 1 | 0 | 30.1 | 37 | 27 | 50 | 0 | 0 | success |
| advised+slide | 0 | yes | 307/307 | 978.6 | 1.3087 | 60 | 98 | 347K | 0 | 0 | 0 | 0 | 11 | 0 | 61 | 0 | 0 | success |

Advice applied: compact-window-unset, explore-default-model, subagent-model-unset, no-statusline.

| arm | run | step 1 | step 2 | step 3 | step 4 | step 5 | step 6 | step 7 | step 8 | step 9 | step 10 | step 11 | step 12 | step 13 | step 14 | step 15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| factory | 0 | 27 (47.8 s) | 69 (78.3 s) | 141 (211.7 s) | 214 (208.8 s) | 261 (100.5 s) | 307 (75.9 s) | 307 (10.3 s) | 307 (71.9 s) | 307 (44.6 s) | 307 (67.9 s) | 307 (6.4 s) | 307 (43.6 s) | 307 (28.9 s) | 307 (30 s) | 307 (6.1 s) |
| advised | 0 | 27 (49.6 s) | 69 (100.6 s) | 141 (191.7 s) | 214 (181.1 s) | 261 (77.8 s) | 307 (70.8 s) | 307 (8.8 s) | 307 (113.6 s) | 307 (53.1 s) | 307 (72.2 s) | 307 (6.1 s) | 307 (34.9 s) | 307 (36.2 s) | 307 (40 s) | 307 (36.4 s) |
| advised+slide | 0 | 27 (51.4 s) | 69 (89.5 s) | 141 (167.6 s) | 214 (207.9 s) | 261 (78.1 s) | 307 (59.3 s) | 307 (9.4 s) | 307 (94.2 s) | 307 (36.6 s) | 307 (62.2 s) | 307 (10.5 s) | 307 (30.3 s) | 307 (22.3 s) | 307 (53 s) | 307 (6.6 s) |

Each run's logs are in its directory: `events.jsonl.gz` (Claude Code's stream), `transcript.jsonl.gz` (the session as Claude Code kept it), `test.txt.gz` (`bun test` after the fixed files were restored), `src.tar.gz` (the code) and `answer.md` (its last words).
