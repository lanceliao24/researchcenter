#!/bin/bash
# Stop hook: warn if there are uncommitted changes on conversation end.
# Outputs JSON with `systemMessage` so Claude Code displays it inline.

[ "$SKIP_HOOKS" = "1" ] && exit 0

# Locate repo root relative to this script.
cd "$(dirname "$0")/../.." || exit 0

# Quietly skip if not a git repo.
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

status=$(git status -s 2>/dev/null)
if [ -z "$status" ]; then
  exit 0
fi

# Count modified vs untracked.
modified=$(echo "$status" | grep -E '^[ MARCDU]' | wc -l | tr -d ' ')
untracked=$(echo "$status" | grep -E '^\?\?' | wc -l | tr -d ' ')

msg="[hook:commit-check] 工作目錄有 ${modified} 個 modified / ${untracked} 個 untracked 檔案未 commit"

# Stop hook protocol: emit JSON to stdout with systemMessage.
jq -n --arg m "$msg" '{systemMessage: $m, suppressOutput: true}'
exit 0
