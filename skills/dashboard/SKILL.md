---
name: dashboard
description: Build and open a local dashboard of where your Claude Code tokens went, from every transcript on this machine.
disable-model-invocation: true
allowed-tools: Bash(tokendoctor-dashboard *)
argument-hint: [days]
---

Run `tokendoctor-dashboard --open` (add `--days $ARGUMENTS` when a number was given). It reads the
usage figures in this machine's transcripts (never message text), writes one self-contained HTML file
and opens it in the browser. Give the path it prints, and in two or three lines say what stands out:
the headline share, the share that went to subagents, and the model and effort that took the most.
The file holds project names and session ids, so it stays on this machine.
