# evalkit, 2026-11-01 19:37

summary vs slide at 100K, clean rerun

238 tests; claude-haiku-5-5; window 100K; 1800 s a run; runs an arm: 5; 2.1.316 (Claude Code); Darwin arm64 26.6.2, load 2.7.

| arm | what |
|---|---|
| factory | Claude Code as it ships, empty config |
| factory+slide | Claude Code as it ships, empty config; the slide down to 25%; tokendoctor 0.4.1 f164c95-dirty |

| arm | run | solved | pass | wall s | cost $ | requests | cache % | max context | compactions | summaries | slides | compact s | reads | re-reads | edits | failed tools | tampered | status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| factory | 0 | yes | 238/238 | 1098.1 | 0.1953 | 24 | 76 | 73K | 4 | 4 | 0 | 66.8 | 17 | 8 | 5 | 0 | 0 | success |
| factory+slide | 0 | yes | 238/238 | 419.2 | 0.0777 | 22 | 88 | 61K | 2 | 0 | 2 | 0 | 1 | 0 | 7 | 0 | 0 | success |
| factory | 1 | yes | 238/238 | 644.2 | 0.0893 | 11 | 73 | 59K | 2 | 2 | 0 | 49.6 | 3 | 1 | 6 | 0 | 0 | success |
| factory+slide | 1 | yes | 238/238 | 520.3 | 0.1030 | 21 | 82 | 66K | 3 | 1 | 2 | 18 | 11 | 2 | 5 | 0 | 0 | success |
| factory | 2 | yes | 238/238 | 737.2 | 0.2367 | 21 | 75 | 66K | 4 | 4 | 0 | 66.3 | 12 | 5 | 7 | 0 | 0 | success |
| factory+slide | 2 | yes | 238/238 | 454.3 | 0.0845 | 13 | 73 | 65K | 3 | 0 | 3 | 0 | 2 | 1 | 5 | 0 | 0 | success |
| factory | 3 | yes | 238/238 | 531.3 | 0.1488 | 11 | 70 | 64K | 2 | 2 | 0 | 30.6 | 4 | 1 | 4 | 0 | 0 | success |
| factory+slide | 3 | yes | 238/238 | 503.8 | 0.0946 | 24 | 84 | 61K | 3 | 0 | 3 | 0 | 1 | 0 | 4 | 9 | 0 | success |
| factory | 4 | yes | 238/238 | 655.8 | 0.1248 | 17 | 75 | 63K | 3 | 3 | 0 | 44.3 | 5 | 1 | 4 | 0 | 0 | success |
| factory+slide | 4 | yes | 238/238 | 534.7 | 0.1119 | 23 | 78 | 64K | 4 | 1 | 3 | 14.8 | 6 | 0 | 5 | 0 | 0 | success |

Each run's logs are in its directory: `events.jsonl.gz` (Claude Code's stream), `transcript.jsonl.gz` (the session as Claude Code kept it), `test.txt.gz` (`bun test` after the fixed files were restored), `src.tar.gz` (the code) and `answer.md` (its last words).
