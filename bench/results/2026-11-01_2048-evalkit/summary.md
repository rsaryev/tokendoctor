# evalkit, 2026-11-01 20:48

slide v2: images counted, turns evicted with a card, calibration

238 tests; claude-haiku-5-5; window 100K; 1800 s a run; runs an arm: 3; 2.1.316 (Claude Code); Darwin arm64 26.6.2, load 2.7.

| arm | what |
|---|---|
| factory+slide | Claude Code as it ships, empty config; the slide down to 25%; tokendoctor 0.4.1 f164c95-dirty |

| arm | run | solved | pass | wall s | cost $ | requests | cache % | max context | compactions | summaries | slides | compact s | reads | re-reads | edits | failed tools | tampered | status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| factory+slide | 0 | yes | 238/238 | 612.7 | 0.1016 | 15 | 80 | 59K | 3 | 1 | 2 | 18 | 2 | 0 | 4 | 0 | 0 | success |
| factory+slide | 1 | yes | 238/238 | 586 | 0.1169 | 23 | 78 | 65K | 4 | 0 | 4 | 0 | 3 | 0 | 3 | 6 | 0 | success |
| factory+slide | 2 | yes | 238/238 | 666.7 | 0.1345 | 19 | 71 | 67K | 4 | 3 | 1 | 51.8 | 5 | 0 | 4 | 0 | 0 | success |

Each run's logs are in its directory: `events.jsonl.gz` (Claude Code's stream), `transcript.jsonl.gz` (the session as Claude Code kept it), `test.txt.gz` (`bun test` after the fixed files were restored), `src.tar.gz` (the code) and `answer.md` (its last words).
