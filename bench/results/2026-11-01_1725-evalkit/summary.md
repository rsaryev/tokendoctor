# evalkit, 2026-11-01 17:25

summary vs slide under pressure, isolated

238 tests; claude-haiku-5-5; window 100K; 1800 s a run; runs an arm: 5; 2.1.316 (Claude Code); Darwin arm64 26.6.2, load 28.6.

| arm | what |
|---|---|
| factory | Claude Code as it ships, empty config |
| factory+slide | Claude Code as it ships, empty config; the slide down to 25%; tokendoctor 0.4.1 f164c95-dirty |

| arm | run | solved | pass | wall s | cost $ | requests | cache % | max context | compactions | summaries | slides | compact s | reads | re-reads | edits | failed tools | tampered | status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| factory | 0 | yes | 238/238 | 766.6 | 0.1257 | 21 | 79 | 67K | 3 | 3 | 0 | 50.5 | 11 | 2 | 5 | 0 | 0 | success |
| factory+slide | 0 | no | 165/238 | 289.8 | 0.0000 | 20 | 86 | 63K | 2 | 0 | 2 | 0.4 | 3 | 1 | 4 | 0 | 0 | — |
| factory | 1 | no | 93/238 | 289.9 | 0.0000 | 11 | 81 | 70K | 1 | 1 | 0 | 32.3 | 5 | 1 | 6 | 0 | 0 | — |
| factory+slide | 1 | yes | 238/238 | 510.3 | 0.1011 | 21 | 77 | 65K | 4 | 0 | 4 | 0.1 | 9 | 3 | 4 | 0 | 0 | success |
| factory | 2 | yes | 238/238 | 579.6 | 0.0969 | 21 | 86 | 63K | 2 | 2 | 0 | 30.8 | 7 | 1 | 9 | 0 | 0 | success |
| factory+slide | 2 | no | 0/238 | 235.1 | 0.0000 | 2 | 77 | 17K | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | — |
| factory | 3 | yes | 238/238 | 728.8 | 0.1574 | 20 | 81 | 70K | 3 | 3 | 0 | 44.8 | 5 | 0 | 1 | 0 | 0 | success |
| factory+slide | 3 | no | 0/238 | 131.3 | 0.0000 | 2 | 77 | 17K | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | — |
| factory | 4 | no | 0/238 | 3.9 | 0.0000 | 1 | 61 | 16K | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |
| factory+slide | 4 | no | 0/238 | 3.7 | 0.0000 | 1 | 61 | 16K | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — |

Each run's logs are in its directory: `events.jsonl.gz` (Claude Code's stream), `transcript.jsonl.gz` (the session as Claude Code kept it), `test.txt.gz` (`bun test` after the fixed files were restored), `src.tar.gz` (the code) and `answer.md` (its last words).
