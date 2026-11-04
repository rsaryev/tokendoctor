---
name: sessions
description: Measure where tokens actually went in recent Claude Code sessions, from the local transcripts.
disable-model-invocation: true
allowed-tools: Bash(tokendoctor-sessions *), Bash(tokendoctor-replay *)
argument-hint: [days]
---

Measure token spend from this machine's session transcripts over the last `$ARGUMENTS` days (30 if
none given).

1. Run `tokendoctor-sessions --json --days <n>` and `tokendoctor-replay --json --days <n>`. Both
   are read-only and read only usage figures, timestamps, tool names and file paths from the
   transcripts, never message text.
2. Costs are dollars at each model's Claude API list price (lib/prices.mjs). What Claude Code bills
   but does not write into transcripts (summary compactions' own requests, titles, WebFetch page
   reads) comes from its own session totals where they hold, else an estimate. On a Pro or Max plan
   these are what the same work would cost on the API, not what it took from the plan's limits: lead
   with shares (percent), and say "at API list prices" with any dollar figure.
3. Open with the person's own number: what share of the period's cost a smaller compaction window
   would have saved, from the replay (the 400K row, and 200K or 300K where they save much more).
   Call it an upper bound: the replay cannot see the work a model does again after a summary. If
   the window is already at or under 400K, or almost no session passed it, say the window would
   change little for them, rather than leading with a small number.
   Then lead with the two or three largest shares: main thread against subagents, the share spent with
   more than 400K tokens in context, and the subagent types that cost the most. Then present each
   finding in one or two plain sentences with its doc link.
4. Connect findings to settings where they apply: `late-compaction` to `autoCompactWindow`,
   `subagents-on-top-model` to `CLAUDE_CODE_SUBAGENT_MODEL` and the Explore override. Offer
   `/tokendoctor:audit` to check and fix them. Never edit files from this skill.
5. Then read `usage` and draw your own conclusions from it: which tools fill the context (calls and
   characters of output, main thread and subagents apart), Bash calls that only printed a file
   (`fileReads`) or slept in a loop (`waits`), the files read most often, and how large subagent
   runs grow (requests, how many passed 200K context). Recommend what would cut the spend you see,
   in plain words with the number behind it. A recommendation is either a setting or an instruction:
   - a setting: give the exact `/tokendoctor <name> <value>` line, which applies it as typed
     (`/tokendoctor` alone lists them). Among them: `bash-output <n>` caps what one Bash call puts
     in context, `slide on`, `window <n>`, `subagents <model>`;
   - an instruction for Claude (how subagents are briefed and sized, what they report back, when to
     read docs, how to wait on a process): draft the few lines and say where they would go (the
     project's memory or `CLAUDE.md`).
   Offer `/tokendoctor:optimize` to apply several at once: it shows each change and applies only
   what the person approves. Leave choices the person made on purpose (in memory or settings) to
   them, with what they cost.
6. When asked about a trend or whether a change helped, run `tokendoctor-sessions --by day` (or
   `--by week`, with `--days <n>`) and compare the periods before and after. Days older than the
   transcripts come from the history the plugin's SessionStart hook records.
7. Say what this cannot see: per-model prices, sessions on other machines, and transcripts Claude
   Code has already cleaned up.
