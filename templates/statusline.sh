#!/bin/bash
# tokendoctor status line. Quiet when all is well, words only where something needs a look:
#   Opus 5.5 · api main* · 120k/367k · cache 1h · 5h 51% · week 35% · $24
#   Opus 5.5 · api main* · 350k/367k · cache cold in 3m · 5h 72% → 100% in 48m · week 35% · $24
# 120k/367k: tokens in context against the point where Claude Code compacts (yellow from half,
# red from 80%). cache 1h: how long the prompt cache stays warm; "cold, resend 350k" means the next
# message re-sends that much uncached. 5h and week: the plan's limits (Pro and Max), with
# "→ 100% in 48m" only when, at the recent pace (5h: the last hour, week: the last day), the limit
# runs out before it resets.
# Needs jq. Run with "refreshInterval": 30 so the countdowns move while you are idle.
input=$(cat)
command -v jq >/dev/null 2>&1 || { echo "tokendoctor status line needs jq"; exit 0; }

# One jq pass reads every field. Tokens in context: the last request's input plus cache reads and
# writes. current_usage is null before the first call and right after /compact; then the count
# shows "--" rather than a stale number. Payloads without the field fall back to total_input_tokens.
eval "$(jq -r '
  (.context_window // {}) as $c | ($c.current_usage // {}) as $u
  | ((($u.input_tokens // 0) + ($u.cache_creation_input_tokens // 0) + ($u.cache_read_input_tokens // 0))) as $n
  | def int: if . == null then "" else floor end;
  @sh "MODEL=\(.model.display_name // "?")",
  @sh "MODEL_ID=\(.model.id // "")",
  @sh "DIR=\(.workspace.current_dir // ".")",
  @sh "TOKENS=\(if $n > 0 then $n | floor elif ($c | has("current_usage")) then "" else ($c.total_input_tokens // 0 | floor) end)",
  @sh "WINDOW=\($c.context_window_size // 0 | floor)",
  @sh "COST=\(.cost.total_cost_usd // 0)",
  @sh "HIT=\(.prompt_cache.hit_ratio | if . == null then "" else (. * 100 | floor) end)",
  @sh "WARM=\(.prompt_cache.warm // "")",
  @sh "CACHE_AT=\(.prompt_cache.expires_at | int)",
  @sh "RESEND=\(.prompt_cache.recache_tokens_if_cold | int)",
  @sh "H5=\(.rate_limits.five_hour.used_percentage | int)",
  @sh "H5_AT=\(.rate_limits.five_hour.resets_at | int)",
  @sh "D7=\(.rate_limits.seven_day.used_percentage | int)",
  @sh "D7_AT=\(.rate_limits.seven_day.resets_at | int)"
' <<<"$input")"

DIM='\033[2m'; CYAN='\033[36m'; GREEN='\033[32m'; YELLOW='\033[33m'; RED='\033[31m'; RESET='\033[0m'
NOW=${TOKENDOCTOR_NOW:-$(date +%s)}
SEP=" ${DIM}·${RESET} "
k() { echo "$(( ($1 + 500) / 1000 ))k"; }

# A duration in seconds as 2d3h, 1h12m, 1h or 38m (minutes rounded up).
span() {
  local s=$1
  if [ "$s" -ge 86400 ]; then echo "$((s / 86400))d$((s % 86400 / 3600))h" | sed 's/d0h$/d/'
  else
    local m=$(((s + 59) / 60))
    if [ "$m" -ge 60 ]; then echo "$((m / 60))h$((m % 60))m" | sed 's/h0m$/h/'; else echo "${m}m"; fi
  fi
}

# The auto-compact window, in Claude Code's order: CLAUDE_CODE_AUTO_COMPACT_WINDOW (a number or
# 400k), then per settings file (most specific first) modelSettings.<model>.autoCompactWindow and
# autoCompactWindow, then the model's own window. Claude Code compacts about 33K before the window
# (a 400K window compacts near 367K), so that is the number shown. CLAUDE_STATUSLINE_COMPACT_AT
# sets the shown point directly.
COMPACT_BUFFER=33000
tokens_of() { case $1 in *[kK]) echo $(( ${1%[kK]} * 1000 ));; *[mM]) echo $(( ${1%[mM]} * 1000000 ));; *) echo "$1";; esac; }
COMPACT_AT=${CLAUDE_STATUSLINE_COMPACT_AT:-}
if [ -z "$COMPACT_AT" ]; then
  W=$(tokens_of "${CLAUDE_CODE_AUTO_COMPACT_WINDOW:-}")
  if [ -z "$W" ]; then
    for f in "$DIR/.claude/settings.local.json" "$DIR/.claude/settings.json" "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"; do
      [ -f "$f" ] || continue
      W=$(jq -r --arg m "$MODEL_ID" '(.modelSettings[$m].autoCompactWindow // .autoCompactWindow) // empty' "$f" 2>/dev/null)
      [ -n "$W" ] && break
    done
  fi
  [ -z "$W" ] && W=$WINDOW
  [ "$W" -gt 0 ] 2>/dev/null || W=200000
  [ "$WINDOW" -gt 0 ] && [ "$WINDOW" -lt "$W" ] && W=$WINDOW
  COMPACT_AT=$((W - COMPACT_BUFFER))
fi

CTX="${DIM}--/$(k "$COMPACT_AT")${RESET}"
if [ -n "$TOKENS" ]; then
  PCT=$((TOKENS * 100 / COMPACT_AT))
  c=$DIM; [ "$PCT" -ge 50 ] && c=$YELLOW; [ "$PCT" -ge 80 ] && c=$RED
  CTX="${c}$(k "$TOKENS")${RESET}${DIM}/$(k "$COMPACT_AT")${RESET}"
fi

WHERE="${DIR##*/}"
if git -C "$DIR" rev-parse --git-dir >/dev/null 2>&1; then
  B=$(git -C "$DIR" branch --show-current 2>/dev/null)
  [ -n "$(git -C "$DIR" status --porcelain --untracked-files=no 2>/dev/null | head -1)" ] && B="$B*"
  WHERE="$WHERE ${GREEN}${B}${RESET}"
fi

# The prompt cache: how long it stays warm, its hit rate only when it is low, a warning in its last
# five minutes, and once cold, how much the next message re-sends.
CACHE=""
if [ -n "$HIT" ]; then
  LEFT=$(( ${CACHE_AT:-0} - NOW ))
  LOW=""; [ "$HIT" -lt 80 ] && LOW=" ${YELLOW}${HIT}% hit${RESET}"
  if [ "$WARM" = "true" ] && [ "$LEFT" -gt 300 ]; then CACHE="${DIM}cache $(span "$LEFT")${RESET}${LOW}"
  elif [ "$WARM" = "true" ] && [ "$LEFT" -gt 0 ]; then CACHE="${YELLOW}cache cold in $(span "$LEFT")${RESET}${LOW}"
  elif [ "$WARM" = "true" ]; then CACHE="${DIM}cache${RESET}${LOW}"
  else CACHE="${YELLOW}cache cold, resend $(k "${RESEND:-${TOKENS:-0}}")${RESET}"; fi
fi

# Limits by pace. Each run records "time 5h% week%" in a small file shared by all sessions (the
# limits are per account), keeping the last 26 hours. The pace is the rise over a recent stretch
# (5h: the last hour, once there are 15 minutes of readings; week: the last day, once there are 3
# hours), else the average since the window began. "→ 100% in" shows only when, at that pace, the
# limit runs out before it resets.
PACE=${TOKENDOCTOR_PACE_FILE:-${CLAUDE_CONFIG_DIR:-$HOME/.claude}/tokendoctor/pace.log}
if [ -n "$H5$D7" ] && mkdir -p "$(dirname "$PACE")" 2>/dev/null; then
  LAST=$(tail -1 "$PACE" 2>/dev/null | cut -d' ' -f1)
  if [ -z "$LAST" ] || [ $((NOW - LAST)) -ge 60 ]; then
    { awk -v cut=$((NOW - 93600)) '$1 >= cut' "$PACE" 2>/dev/null; echo "$NOW ${H5:--} ${D7:--}"; } > "$PACE.tmp" && mv "$PACE.tmp" "$PACE"
  fi
fi
limit() {
  local name=$1 used=$2 at=$3 window=$4 col=$5 back=$6 least=$7
  [ -n "$used" ] || return
  local c=$DIM; [ "$used" -ge 80 ] && c=$RED
  local out="${c}${name} ${used}%${RESET}"
  if [ -n "$at" ] && [ "$at" -gt "$NOW" ] && [ "$used" -lt 100 ]; then
    local ends
    ends=$(cat "$PACE" 2>/dev/null | awk -v now="$NOW" -v used="$used" -v at="$at" -v w="$window" -v col="$col" -v back="$back" -v least="$least" '
      $1 >= now - back && $col != "-" && !t0 { t0 = $1; u0 = $col }
      END {
        if (t0 && now - t0 >= least && used >= u0) rate = (used - u0) / (now - t0)
        else { gone = w - (at - now); rate = gone > 600 ? used / gone : 0 }
        if (rate > 0) { s = (100 - used) / rate; if (s < at - now) printf "%d", s }
      }')
    if [ -n "$ends" ]; then
      [ "$c" = "$DIM" ] && c=$YELLOW
      out="${c}${name} ${used}% → 100% in $(span "$ends")${RESET}"
    fi
  fi
  LIMITS="$LIMITS$SEP$out"
}
LIMITS=""
limit 5h "$H5" "$H5_AT" 18000 2 3600 900
limit week "$D7" "$D7_AT" 604800 3 86400 10800

COST_TEXT=$(awk -v c="$COST" 'BEGIN { printf (c >= 10 ? "$%.0f" : "$%.2f"), c }')
printf '%b\n' "${CYAN}${MODEL}${RESET}${SEP}${WHERE}${SEP}${CTX}${CACHE:+$SEP$CACHE}${LIMITS}${SEP}${DIM}${COST_TEXT}${RESET}"
