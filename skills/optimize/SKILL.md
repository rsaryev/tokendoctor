---
name: optimize
description: Look at token metrics, propose setting changes that cut waste, and apply the ones the person approves.
disable-model-invocation: true
allowed-tools: mcp__tokendoctor__metrics, mcp__tokendoctor__settings, mcp__tokendoctor__config_list, Bash(tokendoctor-sessions *), Bash(tokendoctor-audit *), WebFetch(domain:code.claude.com)
argument-hint: [focus]
---

Tune this Claude Code setup for token use. Focus on `$ARGUMENTS` if given.

Before recommending a setting you are not sure of, read its page in Claude Code's current docs:
every page is Markdown at `https://code.claude.com/docs/en/<page>.md` (index:
`https://code.claude.com/docs/llms.txt`; settings in `settings-reference.md`, variables in
`env-vars.md`, costs in `costs.md`, caching in `prompt-caching.md`). The release changes often, so
prefer that to memory or a mirror.

The tokendoctor tools wait behind ToolSearch: load `mcp__tokendoctor__metrics`,
`mcp__tokendoctor__settings`, `mcp__tokendoctor__config_list`, `mcp__tokendoctor__config_set` and
`mcp__tokendoctor__set_setting` in one ToolSearch call first.

1. **Measure.** Call `metrics` (session context, rate limits, cost, the largest context categories,
   daily totals, audit findings). For the longer view run `tokendoctor-sessions --json --days 30`.
2. **See what can change.** Call `settings` (every setting tokendoctor may change, set or not, with
   its current value and whether a change applies live) and `config_list` (the /config rows).
3. **Propose.** Pick at most five changes, largest saving first. For each give: the setting, the
   current and new value, the evidence from step 1 in one sentence, the trade-off, and whether it
   applies now or at the next session. Costs are dollars at API list prices, which on a plan are not
   what the plan's limits count: speak in shares first. Do not propose a change the numbers do not support.
   **The window.** `autoCompactWindow` sets where Claude Code compacts (for example 400000 on a 1M
   model). Propose a smaller one when much of the cost is spent with a large context (the
   `late-compaction` finding, a high `compactAt`): every request re-reads the whole context, so a
   smaller window is a direct saving, at the price of compacting more often.
   **The slide.** `tokendoctor.slide: true` makes those compactions elide old tool outputs into
   short pointers instead of summarizing: no summary pause, and every prompt, answer and decision stays
   word for word. It is not a saving: measured on 60-file runs it costs the same as a summary (within
   2% on Haiku 5.5 and Sonnet 5.5), and a recall test found no detail the summary lost. Offer it only
   as a separate choice, to someone who says summaries lose what they need, and say that a model may
   now and then read an elided file again.
   **How tools are used.** The `usage` part of `tokendoctor-sessions --json` shows which tools fill
   the context, Bash calls that only printed a file, the files read most and how large subagent runs
   grow. Judge from it yourself. `bashOutputMaxChars` caps one Bash output; with the slide on, a
   file printed through Bash that was read or changed again later is the first thing dropped. What a setting cannot fix (how subagents are briefed and sized, what they report back),
   propose as a few lines for the project's memory or CLAUDE.md and show them; the person writes
   them, or asks you to. Leave
   `tokendoctor.slideTo` at its default (25) unless the person asks: a higher one slides more often,
   and every slide re-sends the context once.
4. **Ask.** Use AskUserQuestion (multiSelect) to let the person pick which changes to apply.
5. **Apply** each picked change with `config_set` (a /config row, live) or `set_setting` (a settings
   file, with a backup). Each call asks the person again; a refusal is final for that change.
6. **Report** what changed, what needs a new session (`model`, `effortLevel` and every `env.*`
   value), and suggest running `tokendoctor-sessions --by day` in a few days to compare. Say that
   `/tokendoctor` shows these settings and `/tokendoctor <name> <value>` changes one with no model call.

Never change hooks, permissions or anything outside the `settings` list. Never write files with
other tools.
