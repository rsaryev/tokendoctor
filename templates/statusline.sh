#!/bin/bash
# tokendoctor status line: model, folder, git branch, a context bar, prompt-cache state and cost.
#   Sonnet 5.5 in api on main  ██████░░░░ 190k/400k  cache 98%  $1.42
# The bar measures against the auto-compact window (see below), not the model's full window, so a
# full bar means compaction is near. "cold" after the cache percentage means the next message re-reads the whole context.
# Needs jq. Reads the JSON Claude Code pipes in (docs: statusline, context_window, prompt_cache).
input=$(cat)
command -v jq >/dev/null 2>&1 || { echo "tokendoctor status line needs jq"; exit 0; }

# One jq pass reads every field. Tokens in context right now: the last request's input plus cache
# reads and writes. current_usage is null before the first call and right after /compact; then
# TOKENS is empty and the line shows "--" rather than a stale count. Payloads without the field at
# all fall back to total_input_tokens.
eval "$(jq -r '
  (.context_window // {}) as $c | ($c.current_usage // {}) as $u
  | ((($u.input_tokens // 0) + ($u.cache_creation_input_tokens // 0) + ($u.cache_read_input_tokens // 0))) as $n
  | @sh "MODEL=\(.model.display_name // "?")",
    @sh "MODEL_ID=\(.model.id // "")",
    @sh "DIR=\(.workspace.current_dir // ".")",
    @sh "TOKENS=\(if $n > 0 then $n | floor elif ($c | has("current_usage")) then "" else ($c.total_input_tokens // 0 | floor) end)",
    @sh "WINDOW=\($c.context_window_size // 0 | floor)",
    @sh "COST=\(.cost.total_cost_usd // 0)",
    @sh "HIT=\(if .prompt_cache.hit_ratio then (.prompt_cache.hit_ratio * 100 | floor | tostring) else "" end)",
    @sh "WARM=\(.prompt_cache.warm // "")",
    @sh "H5=\(.rate_limits.five_hour.used_percentage // "" | if . == "" then . else floor end)",
    @sh "D7=\(.rate_limits.seven_day.used_percentage // "" | if . == "" then . else floor end)"
' <<<"$input")"

# The compaction point, in Claude Code's order: CLAUDE_CODE_AUTO_COMPACT_WINDOW (a number or 400k),
# then per settings file (most specific first) modelSettings.<model>.autoCompactWindow and
# autoCompactWindow, then the model's own window. CLAUDE_STATUSLINE_COMPACT_AT overrides all.
tokens_of() { case $1 in *[kK]) echo $(( ${1%[kK]} * 1000 ));; *[mM]) echo $(( ${1%[mM]} * 1000000 ));; *) echo "$1";; esac; }
COMPACT_AT=${CLAUDE_STATUSLINE_COMPACT_AT:-$(tokens_of "${CLAUDE_CODE_AUTO_COMPACT_WINDOW:-}")}
if [ -z "$COMPACT_AT" ]; then
  for f in "$DIR/.claude/settings.local.json" "$DIR/.claude/settings.json" "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"; do
    [ -f "$f" ] || continue
    COMPACT_AT=$(jq -r --arg m "$MODEL_ID" '(.modelSettings[$m].autoCompactWindow // .autoCompactWindow) // empty' "$f" 2>/dev/null)
    [ -n "$COMPACT_AT" ] && break
  done
fi
[ -z "$COMPACT_AT" ] && COMPACT_AT=$WINDOW
[ "$COMPACT_AT" -gt 0 ] 2>/dev/null || COMPACT_AT=200000
[ "$WINDOW" -gt 0 ] && [ "$WINDOW" -lt "$COMPACT_AT" ] && COMPACT_AT=$WINDOW
SHOWN="--"
[ -n "$TOKENS" ] && SHOWN="$((TOKENS / 1000))k"
TOKENS=${TOKENS:-0}
PCT=$((TOKENS * 100 / COMPACT_AT)); [ "$PCT" -gt 100 ] && PCT=100

DIM='\033[2m'; CYAN='\033[36m'; GREEN='\033[32m'; YELLOW='\033[33m'; RED='\033[31m'; RESET='\033[0m'

if [ "$PCT" -ge 80 ]; then BAR_COLOR=$RED
elif [ "$PCT" -ge 50 ]; then BAR_COLOR=$YELLOW
else BAR_COLOR=$GREEN; fi
FILLED=$((PCT / 10)); EMPTY=$((10 - FILLED))
printf -v FILL "%${FILLED}s"; printf -v PAD "%${EMPTY}s"
BAR="${FILL// /█}${PAD// /░}"

BRANCH=""
if git -C "$DIR" rev-parse --git-dir >/dev/null 2>&1; then
  B=$(git -C "$DIR" branch --show-current 2>/dev/null)
  [ -n "$(git -C "$DIR" status --porcelain --untracked-files=no 2>/dev/null | head -1)" ] && B="$B*"
  BRANCH=" ${DIM}on${RESET} ${GREEN}${B}${RESET}"
fi

CACHE=""
if [ -n "$HIT" ]; then
  if [ "$WARM" = "true" ]; then CACHE="  ${DIM}cache${RESET} ${HIT}%"
  else CACHE="  ${DIM}cache${RESET} ${YELLOW}${HIT}% cold${RESET}"; fi
fi

# Rate limits (Pro/Max only): dim under 50%, yellow from 50%, red from 80%.
limit() {
  [ -n "$2" ] || return
  local c=$DIM; [ "$2" -ge 50 ] && c=$YELLOW; [ "$2" -ge 80 ] && c=$RED
  LIMITS="$LIMITS  ${DIM}$1${RESET} ${c}$2%${RESET}"
}
LIMITS=""; limit 5h "$H5"; limit 7d "$D7"

printf '%b\n' "${CYAN}${MODEL}${RESET} ${DIM}in${RESET} ${DIR##*/}${BRANCH}  ${BAR_COLOR}${BAR}${RESET} ${SHOWN}/$((COMPACT_AT / 1000))k${CACHE}${LIMITS}  ${DIM}\$$(printf '%.2f' "$COST")${RESET}"
