#!/bin/zsh
# cron-sync.sh — Automated ClickUp task sync
# Called by cron or launchd to keep local task files current.

LOG="/Users/kristopherblack/Software/CLICKUP/logs/sync.log"
DIR="/Users/kristopherblack/Software/CLICKUP"

# Ensure log directory exists
mkdir -p "$DIR/logs"

# Cron doesn't source your shell profile — set PATH manually
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

cd "$DIR" || exit 1

echo "--- sync started: $(date) ---" >> "$LOG"

# Export open tasks + prune closed/done/complete locals
pnpm exec ts-node src/cli.ts sync refresh-open >> "$LOG" 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo "ERROR: refresh-open exited $EXIT_CODE" >> "$LOG"
fi

echo "--- sync finished: $(date) (exit $EXIT_CODE) ---" >> "$LOG"
echo "" >> "$LOG"
