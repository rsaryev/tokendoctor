# evalkit, 2026-11-01 21:57

slide v5: thinking and images count as freed, floor 60% of the window without calibration, afterSlide reset after a summary

238 tests; claude-haiku-5-5; window 100K; 1800 s a run; runs an arm: 3; 2.1.316 (Claude Code); Darwin arm64 26.6.2, load 8.1.

| arm | what |
|---|---|
| factory+slide | Claude Code as it ships, empty config; the slide down to 25%; tokendoctor 0.4.1 f164c95-dirty |

| arm | run | solved | pass | wall s | cost $ | requests | cache % | max context | compactions | summaries | slides | compact s | reads | re-reads | edits | failed tools | tampered | status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| factory+slide | 0 | yes | 238/238 | 472 | 0.0864 | 16 | 78 | 61K | 2 | 0 | 2 | 0 | 3 | 2 | 5 | 0 | 0 | success |
| factory+slide | 1 | yes | 238/238 | 472 | 0.0960 | 17 | 73 | 75K | 3 | 0 | 3 | 0 | 9 | 0 | 4 | 0 | 0 | success |
| factory+slide | 2 | yes | 238/238 | 622.3 | 0.1290 | 25 | 75 | 64K | 5 | 0 | 5 | 0 | 15 | 6 | 5 | 0 | 0 | success |

Against the baselines (medians):

| arm | runs | cost | time | cost change | time change |
|---|---|---|---|---|---|
| factory (baseline, [2026-11-01_1937-evalkit](../2026-11-01_1937-evalkit/summary.md)) | 5 | $0.1488 | 655.8 s |  |  |
| factory+slide | 3 | $0.0960 | 472 s | −35% vs factory | −28% vs factory |

Each run's logs are in its directory: `events.jsonl.gz` (Claude Code's stream), `transcript.jsonl.gz` (the session as Claude Code kept it), `test.txt.gz` (`bun test` after the fixed files were restored), `src.tar.gz` (the code) and `answer.md` (its last words).
