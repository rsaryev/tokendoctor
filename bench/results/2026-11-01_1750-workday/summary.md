# workday, 2026-11-01 17:50

summary vs slide over a day of work, isolated

307 tests in 7 steps of one session; claude-haiku-5-5; window 100K; 1800 s a run; runs an arm: 3; 2.1.316 (Claude Code); Darwin arm64 26.6.2, load 4.3.

| arm | what |
|---|---|
| factory | Claude Code as it ships, empty config |
| factory+slide | Claude Code as it ships, empty config; the slide down to 25%; tokendoctor 0.4.1 f164c95-dirty |

| arm | run | solved | pass | wall s | cost $ | requests | cache % | max context | compactions | summaries | slides | compact s | reads | re-reads | edits | failed tools | tampered | status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| factory | 0 | no | 261/307 | 999.9 | 0.1645 | 31 | 83 | 62K | 4 | 4 | 0 | 97.4 | 9 | 3 | 10 | 0 | 0 | success |
| factory+slide | 0 | no | 214/307 | 999.4 | 0.1734 | 34 | 84 | 59K | 5 | 2 | 3 | 47.4 | 11 | 1 | 9 | 7 | 0 | success |
| factory | 1 | yes | 307/307 | 1191.8 | 0.1713 | 38 | 87 | 67K | 4 | 4 | 0 | 136.6 | 5 | 0 | 11 | 0 | 0 | success |
| factory+slide | 1 | yes | 307/307 | 762.6 | 0.1456 | 31 | 84 | 65K | 4 | 0 | 4 | 0.4 | 4 | 2 | 10 | 0 | 0 | success |
| factory | 2 | yes | 307/307 | 1090.9 | 0.2008 | 39 | 85 | 64K | 5 | 5 | 0 | 102.9 | 6 | 1 | 10 | 1 | 0 | success |
| factory+slide | 2 | yes | 307/307 | 791.7 | 0.1386 | 37 | 87 | 65K | 4 | 0 | 4 | 0.1 | 2 | 1 | 12 | 0 | 0 | success |

| arm | run | step 1 | step 2 | step 3 | step 4 | step 5 |
|---|---|---|---|---|---|---|
| factory | 0 | 27 (52 s) | 69 (98 s) | 141 (471.7 s) | 214 (283.8 s) | 261 (94.5 s) |
| factory+slide | 0 | 27 (56 s) | 69 (88.2 s) | 141 (194.3 s) | 214 (613.5 s) | 214 (47.4 s) |
| factory | 1 | 27 (49.6 s) | 69 (109.9 s) | 141 (353.3 s) | 214 (269.8 s) | 261 (231.9 s) | 307 (165.8 s) | 307 (11.5 s) |
| factory+slide | 1 | 27 (46.6 s) | 69 (104 s) | 141 (227.2 s) | 214 (231.8 s) | 261 (87.6 s) | 307 (57.4 s) | 307 (7.8 s) |
| factory | 2 | 27 (58.3 s) | 69 (117.7 s) | 141 (441.5 s) | 214 (287.8 s) | 261 (72.5 s) | 307 (101.7 s) | 307 (11.4 s) |
| factory+slide | 2 | 27 (84 s) | 69 (120.8 s) | 141 (201.8 s) | 214 (231 s) | 261 (87.3 s) | 307 (59.3 s) | 307 (7.6 s) |

Each run's logs are in its directory: `events.jsonl.gz` (Claude Code's stream), `transcript.jsonl.gz` (the session as Claude Code kept it), `test.txt.gz` (`bun test` after the fixed files were restored), `src.tar.gz` (the code) and `answer.md` (its last words).
