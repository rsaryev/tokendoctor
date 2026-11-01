# evalkit, 2026-11-01 21:04

slide v3: v2, judged by the messages it frees

238 tests; claude-haiku-5-5; window 100K; 1800 s a run; runs an arm: 3; 2.1.316 (Claude Code); Darwin arm64 26.6.2, load 3.2.

| arm | what |
|---|---|
| factory+slide | Claude Code as it ships, empty config; the slide down to 25%; tokendoctor 0.4.1 f164c95-dirty |

| arm | run | solved | pass | wall s | cost $ | requests | cache % | max context | compactions | summaries | slides | compact s | reads | re-reads | edits | failed tools | tampered | status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| factory+slide | 0 | yes | 238/238 | 671.1 | 0.1253 | 22 | 76 | 69K | 4 | 2 | 2 | 33.6 | 6 | 0 | 2 | 0 | 0 | success |
| factory+slide | 1 | yes | 238/238 | 630.2 | 0.1226 | 20 | 80 | 68K | 3 | 3 | 0 | 52 | 6 | 0 | 5 | 0 | 0 | success |
| factory+slide | 2 | yes | 238/238 | 788.9 | 0.1559 | 23 | 73 | 69K | 5 | 4 | 1 | 75 | 7 | 2 | 4 | 1 | 0 | success |

Each run's logs are in its directory: `events.jsonl.gz` (Claude Code's stream), `transcript.jsonl.gz` (the session as Claude Code kept it), `test.txt.gz` (`bun test` after the fixed files were restored), `src.tar.gz` (the code) and `answer.md` (its last words).
