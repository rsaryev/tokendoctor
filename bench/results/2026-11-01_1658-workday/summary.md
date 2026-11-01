# workday, 2026-11-01 16:58

pilot: how far a day of work grows

307 tests in 7 steps of one session; claude-haiku-5-5; window each profile's own; 1800 s a run; runs an arm: 1; 2.1.316 (Claude Code); Darwin arm64 26.6.2, load 16.2.

| arm | what |
|---|---|
| factory | Claude Code as it ships, empty config |
| advised | every fix tokendoctor's audit offers applied; tokendoctor 0.4.1 f164c95-dirty |
| advised+slide | every fix tokendoctor's audit offers applied; the slide down to 25%; tokendoctor 0.4.1 f164c95-dirty |

| arm | run | solved | pass | wall s | cost $ | requests | cache % | max context | compactions | summaries | slides | compact s | reads | re-reads | edits | failed tools | tampered | status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| factory | 0 | yes | 307/307 | 997.3 | 0.6252 | 30 | 94 | 253K | 0 | 0 | 0 | 0 | 7 | 0 | 13 | 0 | 0 | success |
| advised | 0 | yes | 307/307 | 797.3 | 0.6563 | 34 | 95 | 270K | 0 | 0 | 0 | 0 | 7 | 0 | 13 | 0 | 0 | success |
| advised+slide | 0 | yes | 307/307 | 716.4 | 0.6261 | 28 | 94 | 249K | 0 | 0 | 0 | 0 | 1 | 0 | 16 | 0 | 0 | success |

Advice applied: compact-window-unset, explore-default-model, subagent-model-unset, no-statusline.

| arm | run | step 1 | step 2 | step 3 | step 4 | step 5 | step 6 | step 7 |
|---|---|---|---|---|---|---|---|---|
| factory | 0 | 27 (94.6 s) | 69 (155.8 s) | 141 (177.3 s) | 214 (316.1 s) | 261 (133.2 s) | 307 (107.1 s) | 307 (13.1 s) |
| advised | 0 | 27 (74.4 s) | 69 (119.3 s) | 141 (208.8 s) | 214 (207.3 s) | 261 (96 s) | 307 (75.6 s) | 307 (15.8 s) |
| advised+slide | 0 | 27 (47.4 s) | 69 (82.7 s) | 141 (186.6 s) | 214 (234.1 s) | 261 (89 s) | 307 (64.3 s) | 307 (12.2 s) |

Each run's logs are in its directory: `events.jsonl.gz` (Claude Code's stream), `transcript.jsonl.gz` (the session as Claude Code kept it), `test.txt.gz` (`bun test` after the fixed files were restored), `src.tar.gz` (the code) and `answer.md` (its last words).
