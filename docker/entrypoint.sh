#!/bin/sh
# Docker entrypoint script
# Handles initialization and graceful startup

set -e

echo "Starting GDPR User Registry..."
echo "Environment: $NODE_ENV"

# Create data directory if it doesn't exist
if [ ! -d "./data" ]; then
    echo "Creating data directory..."
    mkdir -p ./data
fi

# Check if database exists
if [ ! -f "./data/users.db" ]; then
    echo "Database not found, will be created on first run..."
fi

# Run any initialization commands
echo "Initialization complete"
echo "Server starting on port $PORT"

# Start the application
exec node server.js
