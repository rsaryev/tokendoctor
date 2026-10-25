#!/usr/bin/env python3
"""Turns a raw asciinema recording of scripts/record-demo.exp into public/demo.cast.

Drops expect's own lines, keeps typing at a natural pace (a keystroke waits at most 0.12 s), runs
everything else fast (a screen update waits at most 0.06 s, so the model's thinking and streaming
take a second or two), adds a pause after each finished answer so it can be read, and marks two
chapters for the player.
Usage: python3 scripts/polish-cast.py raw.cast public/demo.cast
"""
import json
import re
import sys

src, dst = sys.argv[1], sys.argv[2]
lines = open(src).read().splitlines()
term = json.loads(lines[0])["term"]
events = [json.loads(l) for l in lines[1:]]
events = [e for e in events if e[1] == "o" and not e[2].startswith("spawn ")]

DONE = re.compile(r"\w+ for \d+s · done")
CHAPTERS = [("/tokendoctor:sessions", "Measure: /tokendoctor:sessions"), ("--by", "Trend: tokendoctor-sessions --by day")]
READ_PAUSES = [3.5, 4.5]
TYPING = 0.12
SCREEN = 0.06

out, seen, tail, pauses = [], set(), "", 0
for i, (gap, _, text) in enumerate(events):
    cap = TYPING if len(text) <= 2 else SCREEN
    out.append([round(0.2 if i == 0 else min(gap, cap), 3), "o", text])
    tail = (tail + text)[-400:]
    for key, label in CHAPTERS:
        if key not in seen and key in tail:
            seen.add(key)
            out.append([0, "m", label])
    if DONE.search(text) and pauses < len(READ_PAUSES):
        out.append([READ_PAUSES[pauses], "o", ""])
        pauses += 1

with open(dst, "w") as f:
    f.write(json.dumps({"version": 3, "term": term, "title": "tokendoctor in Claude Code"}) + "\n")
    f.writelines(json.dumps(e) + "\n" for e in out)
print(f"{sum(e[0] for e in out):.1f}s, {pauses} read pauses, {len(seen)} chapters")
