#!/bin/bash
# token-doctor status line: model, folder, git branch, a context bar, prompt-cache state and cost.
#   Sonnet 5.5 in api on main  ██████░░░░ 190k/300k  cache 98%  $1.42
# The bar measures against the auto-compact window (autoCompactWindow in your settings, or
# CLAUDE_STATUSLINE_COMPACT_AT), not the model's full window, so a full bar means compaction is
# near. "cold" after the cache percentage means the next message re-reads the whole context.
# Needs jq. Reads the JSON Claude Code pipes in (docs: statusline, context_window, prompt_cache).
input=$(cat)
command -v jq >/dev/null 2>&1 || { echo "token-doctor status line needs jq"; exit 0; }

MODEL=$(jq -r '.model.display_name // "?"' <<<"$input")
DIR=$(jq -r '.workspace.current_dir // "."' <<<"$input")
TOKENS=$(jq -r '.context_window.total_input_tokens // 0' <<<"$input" | cut -d. -f1)
WINDOW=$(jq -r '.context_window.context_window_size // 0' <<<"$input" | cut -d. -f1)
COST=$(jq -r '.cost.total_cost_usd // 0' <<<"$input")
HIT=$(jq -r 'if .prompt_cache.hit_ratio then (.prompt_cache.hit_ratio * 100 | floor | tostring) else "" end' <<<"$input")
WARM=$(jq -r '.prompt_cache.warm // empty' <<<"$input")

# The compaction point: the override, then the first autoCompactWindow found in the settings
# files (most specific first), then the model's own window.
COMPACT_AT=${CLAUDE_STATUSLINE_COMPACT_AT:-}
if [ -z "$COMPACT_AT" ]; then
  for f in "$DIR/.claude/settings.local.json" "$DIR/.claude/settings.json" "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"; do
    [ -f "$f" ] || continue
    COMPACT_AT=$(jq -r '.autoCompactWindow // empty' "$f" 2>/dev/null)
    [ -n "$COMPACT_AT" ] && break
  done
fi
[ -z "$COMPACT_AT" ] && COMPACT_AT=$WINDOW
[ "$COMPACT_AT" -gt 0 ] 2>/dev/null || COMPACT_AT=200000
[ "$WINDOW" -gt 0 ] && [ "$WINDOW" -lt "$COMPACT_AT" ] && COMPACT_AT=$WINDOW
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

printf '%b\n' "${CYAN}${MODEL}${RESET} ${DIM}in${RESET} ${DIR##*/}${BRANCH}  ${BAR_COLOR}${BAR}${RESET} $((TOKENS / 1000))k/$((COMPACT_AT / 1000))k${CACHE}  ${DIM}\$$(printf '%.2f' "$COST")${RESET}"
