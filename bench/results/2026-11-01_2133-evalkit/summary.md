# evalkit, 2026-11-01 21:33

slide v4: least is half the text it sees — runs 0 and 1 stopped by hand after ~20 min, unfinished: 3 slides then 2 summaries each (60 and 72 requests). Haiku's answers thought 40-60K tokens that v4 did not count as freed, and after a summary the next compaction summarized too; v5 fixes both (2026-11-01_22xx).

238 tests; claude-haiku-5-5; window 100K; 1800 s a run; runs an arm: 3; 2.1.316 (Claude Code); Darwin arm64 26.6.2, load 2.9.

| arm | what |
|---|---|
| factory+slide | Claude Code as it ships, empty config; the slide down to 25%; tokendoctor 0.4.1 f164c95-dirty |

| arm | run | solved | pass | wall s | cost $ | requests | cache % | max context | compactions | summaries | slides | compact s | reads | re-reads | edits | failed tools | tampered | status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| factory+slide | 2 | yes | 238/238 | 429.7 | 0.0750 | 16 | 82 | 64K | 2 | 1 | 1 | 16.4 | 3 | 1 | 5 | 0 | 0 | success |

Against the baselines (medians):

| arm | runs | cost | time | cost change | time change |
|---|---|---|---|---|---|
| factory (baseline, [2026-11-01_1937-evalkit](../2026-11-01_1937-evalkit/summary.md)) | 5 | $0.1488 | 655.8 s |  |  |
| factory+slide | 1 | $0.0750 | 429.7 s | −50% vs factory | −34% vs factory |

Each run's logs are in its directory: `events.jsonl.gz` (Claude Code's stream), `transcript.jsonl.gz` (the session as Claude Code kept it), `test.txt.gz` (`bun test` after the fixed files were restored), `src.tar.gz` (the code) and `answer.md` (its last words).
