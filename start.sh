#!/bin/sh
# Run both API and Telegram bot in one container.
# If either process dies, exit so the container restarts.

echo "Starting Xperise API + Telegram bot..."

cd /app/apps/api && node dist/server.mjs &
API_PID=$!

cd /app/apps/telegram && node dist/index.js &
BOT_PID=$!

echo "API PID: $API_PID | Bot PID: $BOT_PID"

# Monitor both processes — if either exits, kill the other and restart container
while true; do
  if ! kill -0 $API_PID 2>/dev/null; then
    echo "API process died — shutting down for restart..."
    kill $BOT_PID 2>/dev/null
    exit 1
  fi
  if ! kill -0 $BOT_PID 2>/dev/null; then
    echo "Bot process died — shutting down for restart..."
    kill $API_PID 2>/dev/null
    exit 1
  fi
  sleep 5
done
