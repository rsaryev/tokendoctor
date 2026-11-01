# fixkit, 2026-11-01 16:46

before: tokendoctor as it is now

238 tests; claude-haiku-5-5; window 100K; 1800 s a run; runs an arm: 5; 2.1.316 (Claude Code); Darwin arm64 26.6.2, load 1.4.

| arm | what |
|---|---|
| stock | Claude Code as it ships |
| slide | tokendoctor 0.4.1 f164c95-dirty, slide to 25% |

| arm | run | solved | pass | wall s | cost $ | requests | cache % | max context | compactions | summaries | slides | compact s | reads | re-reads | edits | failed tools | tampered | status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| stock | 0 | yes | 238/238 | 113 | 0.0354 | 17 | 89 | 68K | 1 | 1 | 0 | 17.1 | 2 | 0 | 3 | 0 | 0 | success |
| slide | 0 | yes | 238/238 | 117.9 | 0.0321 | 21 | 89 | 60K | 1 | 0 | 1 | 0 | 4 | 0 | 14 | 0 | 0 | success |
| stock | 1 | yes | 238/238 | 152 | 0.0459 | 29 | 93 | 64K | 1 | 1 | 0 | 13.8 | 1 | 0 | 11 | 0 | 0 | success |
| slide | 1 | yes | 238/238 | 140 | 0.0372 | 14 | 81 | 66K | 1 | 0 | 1 | 0 | 5 | 0 | 11 | 0 | 0 | success |
| stock | 2 | yes | 238/238 | 108.1 | 0.0375 | 17 | 86 | 60K | 1 | 1 | 0 | 15.2 | 6 | 1 | 12 | 0 | 0 | success |
| slide | 2 | yes | 238/238 | 125.3 | 0.0350 | 15 | 84 | 62K | 1 | 0 | 1 | 0 | 6 | 1 | 11 | 0 | 0 | success |
| stock | 3 | yes | 238/238 | 180.3 | 0.0488 | 18 | 86 | 66K | 1 | 1 | 0 | 19.2 | 5 | 0 | 12 | 1 | 0 | success |
| slide | 3 | yes | 238/238 | 139.2 | 0.0365 | 24 | 90 | 65K | 1 | 0 | 1 | 0 | 6 | 2 | 11 | 0 | 0 | success |
| stock | 4 | yes | 238/238 | 223.9 | 0.0491 | 17 | 80 | 64K | 2 | 2 | 0 | 39.6 | 7 | 0 | 11 | 0 | 0 | success |
| slide | 4 | yes | 238/238 | 106.2 | 0.0331 | 14 | 84 | 62K | 1 | 0 | 1 | 0 | 3 | 0 | 11 | 0 | 0 | success |

Each run's logs are in its directory: `events.jsonl.gz` (Claude Code's stream), `transcript.jsonl.gz` (the session as Claude Code kept it), `test.txt.gz` (`bun test` after the fixed files were restored), `src.tar.gz` (the code) and `answer.md` (its last words).
