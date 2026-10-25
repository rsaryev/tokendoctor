---
name: sessions
description: Measure where tokens actually went in recent Claude Code sessions, from the local transcripts.
disable-model-invocation: true
allowed-tools: Bash(tokendoctor-sessions *)
argument-hint: [days]
---

Measure token spend from this machine's session transcripts over the last `$ARGUMENTS` days (30 if
none given).

1. Run `tokendoctor-sessions --json --days <n>`. It is read-only and reads only usage figures,
   timestamps, tool names and file paths from the transcripts, never message text.
2. Costs are in input-token equivalents: relative API prices, with no per-model price applied.
   Present them as shares (percent), never as dollars.
3. Lead with the two or three largest shares: main thread against subagents, the share spent with
   more than 400K tokens in context, and the subagent types that cost the most. Then present each
   finding in one or two plain sentences with its doc link.
4. Connect findings to settings where they apply: `late-compaction` to `autoCompactWindow`,
   `subagents-on-top-model` to `CLAUDE_CODE_SUBAGENT_MODEL` and the Explore override. Offer
   `/tokendoctor:audit` to check and fix them. Never edit files from this skill.
5. When asked about a trend or whether a change helped, run `tokendoctor-sessions --by day` (or
   `--by week`, with `--days <n>`) and compare the periods before and after. Days older than the
   transcripts come from the history the plugin's SessionStart hook records.
6. Say what this cannot see: per-model prices, sessions on other machines, and transcripts Claude
   Code has already cleaned up.
