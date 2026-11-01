# shopkit, 2026-11-01 16:55

smoke: the isolated profiles

69 tests; claude-haiku-5-5; window each profile's own; 1800 s a run; runs an arm: 1; 2.1.316 (Claude Code); Darwin arm64 26.6.2, load 3.8.

| arm | what |
|---|---|
| factory | Claude Code as it ships, empty config |
| advised | every fix tokendoctor's audit offers applied; tokendoctor 0.4.1 f164c95-dirty |
| advised+slide | every fix tokendoctor's audit offers applied; the slide down to 25%; tokendoctor 0.4.1 f164c95-dirty |

| arm | run | solved | pass | wall s | cost $ | requests | cache % | max context | compactions | summaries | slides | compact s | reads | re-reads | edits | failed tools | tampered | status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| factory | 0 | yes | 69/69 | 181.4 | 0.0276 | 8 | 86 | 57K | 0 | 0 | 0 | 0 | 0 | 0 | 6 | 0 | 0 | success |
| advised | 0 | yes | 69/69 | 160.4 | 0.0327 | 7 | 83 | 64K | 0 | 0 | 0 | 0 | 0 | 0 | 6 | 0 | 0 | success |
| advised+slide | 0 | yes | 69/69 | 111 | 0.0229 | 6 | 80 | 52K | 0 | 0 | 0 | 0 | 0 | 0 | 6 | 0 | 0 | success |

Advice applied: compact-window-unset, explore-default-model, subagent-model-unset, no-statusline.

Each run's logs are in its directory: `events.jsonl.gz` (Claude Code's stream), `transcript.jsonl.gz` (the session as Claude Code kept it), `test.txt.gz` (`bun test` after the fixed files were restored), `src.tar.gz` (the code) and `answer.md` (its last words).
