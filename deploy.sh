#!/bin/bash

# Discord Bot Deployment Script

set -e  # Exit on error

echo "🚀 Starting deployment..."

# Pull latest changes
echo "📥 Pulling latest changes from GitHub..."
git pull origin main

# Install/update dependencies
echo "📦 Installing dependencies..."
npm install --include=dev

# Restart the bot with PM2
echo "🔄 Restarting bot..."
pm2 restart ecosystem.config.cjs

echo "✅ Deployment complete!"
echo "📊 Bot status:"
pm2 status
pm2 logs studo-bot --lines 20
