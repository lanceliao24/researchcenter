#!/bin/bash
# PostToolUse hook: run TypeScript typecheck after Edit/Write of .ts/.tsx files.
# Always exits 0 — informational, never blocks.

[ "$SKIP_HOOKS" = "1" ] && exit 0

# Read tool input JSON from stdin (Claude Code passes it).
input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // .tool_response.filePath // empty')

# Only fire on TypeScript files.
case "$file_path" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

echo "[hook:typecheck] $(basename "$file_path") edited — running npm run check:fast" >&2

cd "$(dirname "$0")/../.." || exit 0

output=$(npm run --silent check:fast 2>&1)
exit_code=$?

if [ $exit_code -eq 0 ]; then
  echo "[hook:typecheck] ✓ pass" >&2
else
  echo "[hook:typecheck] ✗ typecheck failed:" >&2
  # Print only first ~30 lines to avoid flooding
  echo "$output" | head -30 >&2
fi

exit 0
