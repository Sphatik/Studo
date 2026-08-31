#!/bin/bash

# Discord Bot Deployment Script

set -e  # Exit on error

echo "🚀 Starting deployment..."

# Sync to latest main, discarding any local drift in tracked files.
# Untracked files (.env, database.sqlite, logs/, tts_cache/) are unaffected.
echo "📥 Syncing with GitHub..."
git fetch origin main
git reset --hard origin/main

# Install dependencies exactly as locked (tsx is a devDependency the bot needs at runtime)
echo "📦 Installing dependencies..."
npm ci --include=dev

# Register slash commands so new/changed commands show up in Discord
echo "📝 Registering slash commands..."
npx tsx src/register.js

# Restart the bot with PM2.
# delete + start (not restart) so ecosystem.config.cjs changes like exec_mode actually apply.
echo "🔄 Restarting bot..."
pm2 delete studo-bot 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo "✅ Deployment complete!"
echo "📊 Bot status:"
pm2 status
pm2 logs studo-bot --lines 20 --nostream
