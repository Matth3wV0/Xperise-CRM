#!/bin/sh
# Run both API and Telegram bot in one container.
# If either process dies, exit so the container restarts.

echo "Starting Xperise API + Telegram bot..."

cd /app/apps/api && node dist/server.mjs &
API_PID=$!

cd /app/apps/telegram && node dist/index.js &
BOT_PID=$!

echo "API PID: $API_PID | Bot PID: $BOT_PID"

# Wait for either process to exit, then kill the other and restart
wait -n $API_PID $BOT_PID
EXIT_CODE=$?

echo "A process exited with code $EXIT_CODE — shutting down for restart..."
kill $API_PID $BOT_PID 2>/dev/null
exit 1
