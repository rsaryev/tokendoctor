# fixkit, 2026-11-01 16:43

pilot: one context, no subagents

238 tests; claude-haiku-5-5; window 100K; 1800 s a run; runs an arm: 1; 2.1.316 (Claude Code); Darwin arm64 26.6.2, load 4.5.

| arm | what |
|---|---|
| stock | Claude Code as it ships |
| slide | tokendoctor 0.4.1 f164c95-dirty, slide to 25% |

| arm | run | solved | pass | wall s | cost $ | requests | cache % | max context | compactions | summaries | slides | compact s | reads | re-reads | edits | failed tools | tampered | status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| stock | 0 | yes | 238/238 | 135.2 | 0.0389 | 14 | 84 | 64K | 1 | 1 | 0 | 15.6 | 3 | 0 | 12 | 0 | 0 | success |
| slide | 0 | yes | 238/238 | 131.4 | 0.0369 | 19 | 87 | 63K | 1 | 0 | 1 | 0 | 4 | 0 | 12 | 0 | 0 | success |

Each run's logs are in its directory: `events.jsonl.gz` (Claude Code's stream), `transcript.jsonl.gz` (the session as Claude Code kept it), `test.txt.gz` (`bun test` after the fixed files were restored), `src.tar.gz` (the code) and `answer.md` (its last words).
