# fixkit, 2026-11-01 17:15

summary vs slide under pressure, isolated

238 tests; claude-haiku-5-5; window 100K; 1800 s a run; runs an arm: 5; 2.1.316 (Claude Code); Darwin arm64 26.6.2, load 2.4.

| arm | what |
|---|---|
| factory | Claude Code as it ships, empty config |
| factory+slide | Claude Code as it ships, empty config; the slide down to 25%; tokendoctor 0.4.1 f164c95-dirty |

| arm | run | solved | pass | wall s | cost $ | requests | cache % | max context | compactions | summaries | slides | compact s | reads | re-reads | edits | failed tools | tampered | status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| factory | 0 | yes | 238/238 | 153.7 | 0.0361 | 16 | 88 | 69K | 1 | 1 | 0 | 15.8 | 5 | 1 | 12 | 0 | 0 | success |
| factory+slide | 0 | yes | 238/238 | 176.9 | 0.0460 | 16 | 85 | 70K | 1 | 0 | 1 | 0 | 5 | 0 | 12 | 2 | 0 | success |
| factory | 1 | yes | 238/238 | 127.8 | 0.0349 | 17 | 87 | 64K | 1 | 1 | 0 | 14 | 3 | 0 | 11 | 0 | 0 | success |
| factory+slide | 1 | yes | 238/238 | 86.8 | 0.0240 | 8 | 71 | 62K | 1 | 0 | 1 | 0 | 5 | 0 | 12 | 0 | 0 | success |
| factory | 2 | yes | 238/238 | 175.6 | 0.0468 | 20 | 89 | 64K | 1 | 1 | 0 | 16 | 7 | 2 | 13 | 0 | 0 | success |
| factory+slide | 2 | yes | 238/238 | 121 | 0.0351 | 16 | 85 | 63K | 1 | 0 | 1 | 0 | 5 | 0 | 11 | 0 | 0 | success |
| factory | 3 | yes | 238/238 | 176 | 0.0444 | 16 | 87 | 62K | 1 | 1 | 0 | 29.2 | 6 | 1 | 13 | 0 | 0 | success |
| factory+slide | 3 | yes | 238/238 | 128.2 | 0.0394 | 12 | 81 | 67K | 1 | 0 | 1 | 0 | 6 | 1 | 12 | 0 | 0 | success |
| factory | 4 | yes | 238/238 | 113.1 | 0.0373 | 15 | 85 | 61K | 1 | 1 | 0 | 11.4 | 5 | 0 | 12 | 0 | 0 | success |
| factory+slide | 4 | yes | 238/238 | 175.9 | 0.0495 | 26 | 87 | 64K | 2 | 0 | 2 | 0.7 | 7 | 2 | 11 | 0 | 0 | success |

Each run's logs are in its directory: `events.jsonl.gz` (Claude Code's stream), `transcript.jsonl.gz` (the session as Claude Code kept it), `test.txt.gz` (`bun test` after the fixed files were restored), `src.tar.gz` (the code) and `answer.md` (its last words).
