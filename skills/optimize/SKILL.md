---
name: optimize
description: Look at token metrics, propose setting changes that cut waste, and apply the ones the person approves.
disable-model-invocation: true
allowed-tools: mcp__tokendoctor__metrics, mcp__tokendoctor__settings, mcp__tokendoctor__config_list, Bash(tokendoctor-sessions *), Bash(tokendoctor-audit *)
argument-hint: [focus]
---

Tune this Claude Code setup for token use. Focus on `$ARGUMENTS` if given.

The tokendoctor tools wait behind ToolSearch: load `mcp__tokendoctor__metrics`,
`mcp__tokendoctor__settings`, `mcp__tokendoctor__config_list`, `mcp__tokendoctor__config_set` and
`mcp__tokendoctor__set_setting` in one ToolSearch call first.

1. **Measure.** Call `metrics` (session context, rate limits, cost, the largest context categories,
   daily totals, audit findings). For the longer view run `tokendoctor-sessions --json --days 30`.
2. **See what can change.** Call `settings` (every setting tokendoctor may change, set or not, with
   its current value and whether a change applies live) and `config_list` (the /config rows).
3. **Propose.** Pick at most five changes, largest saving first. For each give: the setting, the
   current and new value, the evidence from step 1 in one sentence, the trade-off, and whether it
   applies now or at the next session. Costs are input-token equivalents: speak in shares, never
   dollars. Do not propose a change the numbers do not support.
4. **Ask.** Use AskUserQuestion (multiSelect) to let the person pick which changes to apply.
5. **Apply** each picked change with `config_set` (a /config row, live) or `set_setting` (a settings
   file, with a backup). Each call asks the person again; a refusal is final for that change.
6. **Report** what changed, what needs a new session (`model`, `effortLevel` and every `env.*`
   value), and suggest running `tokendoctor-sessions --by day` in a few days to compare.

Never change hooks, permissions or anything outside the `settings` list. Never write files with
other tools.
