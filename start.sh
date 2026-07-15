#!/bin/bash
# Start the Notabene compliance demo server
# Tunnel management: use Settings page (Generate/Regenerate buttons)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Kill existing processes
echo "Stopping existing processes..."
pkill -f "node server.js" 2>/dev/null
pkill -f "cloudflared.*localhost:8000" 2>/dev/null
sleep 2

# Start Node server
echo "Starting server on port 8000..."
node server.js &
SERVER_PID=$!
sleep 2

echo ""
echo "============================================"
echo "  Server: http://localhost:8000"
echo "  Server PID: $SERVER_PID"
echo "  Tunnel: Use Settings page → Generate URL"
echo "============================================"
echo ""
echo "Press Ctrl+C to stop."

wait
