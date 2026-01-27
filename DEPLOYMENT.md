# Deployment Guide

This guide covers setting up automatic deployment and ensuring your Discord bot stays running on your VPS.

## Initial VPS Setup

### 1. Install PM2 on your VPS

SSH into your VPS and install PM2 globally:

```bash
npm install -g pm2
```

### 2. Clone your repository

```bash
cd ~  # or wherever you want to keep the bot
git clone <your-repo-url> studo-bot
cd studo-bot
npm install
```

### 3. Set up environment variables

Create a `.env` file with your Discord bot token and other secrets:

```bash
nano .env
```

Add your environment variables (never commit this file!):
```
DISCORD_TOKEN=your_token_here
CLIENT_ID=your_client_id_here
# Add any other secrets
```

### 4. Start the bot with PM2

```bash
pm2 start ecosystem.config.cjs
```

### 5. Set up PM2 to start on system reboot

This ensures your bot starts automatically if the VPS restarts:

```bash
pm2 startup
# Follow the command it outputs (it will give you a command to run with sudo)

pm2 save
```

### 6. Make deploy script executable

```bash
chmod +x deploy.sh
```

## Automatic Deployment with GitHub Actions

### 1. Generate SSH Key on your VPS (if you don't have one)

```bash
ssh-keygen -t ed25519 -C "github-actions"
# Press enter to accept default location
# Don't set a passphrase (just press enter)
```

### 2. Add the public key to authorized_keys

```bash
cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys
```

### 3. Copy the private key

```bash
cat ~/.ssh/id_ed25519
```

Copy the entire output (including `-----BEGIN` and `-----END` lines).

### 4. Add GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions → New repository secret

Add these secrets:

- `VPS_HOST`: Your VPS IP address or domain (e.g., `123.45.67.89`)
- `VPS_USERNAME`: Your SSH username (e.g., `root` or `ubuntu`)
- `VPS_SSH_KEY`: The private key you copied in step 3
- `VPS_PORT`: SSH port (usually `22`, optional if using default)
- `VPS_PROJECT_PATH`: Full path to your project on VPS (e.g., `/root/studo-bot`)

### 5. Test the deployment

Push to your main branch and check the Actions tab on GitHub to see if deployment succeeds.

## Manual Deployment

If you want to deploy manually from your VPS:

```bash
cd /path/to/your/bot
./deploy.sh
```

Or use npm:

```bash
npm run deploy
```

## Useful PM2 Commands

On your VPS, you can use these commands:

```bash
# View logs
pm2 logs studo-bot

# Check status
pm2 status

# Restart bot
pm2 restart studo-bot

# Stop bot
pm2 stop studo-bot

# Start bot
pm2 start ecosystem.config.cjs

# Monitor in real-time
pm2 monit

# View detailed info
pm2 show studo-bot
```

## NPM Scripts (from local machine or VPS)

```bash
npm run start      # Start the bot with PM2
npm run stop       # Stop the bot
npm run restart    # Restart the bot
npm run logs       # View logs
npm run status     # Check status
npm run deploy     # Run deployment script
```

## Troubleshooting

### Bot won't start
- Check logs: `pm2 logs studo-bot --err`
- Check if environment variables are set: `pm2 env 0`
- Make sure `.env` file exists on VPS

### GitHub Actions deployment fails
- Check that all secrets are set correctly
- Verify SSH access: `ssh -i /path/to/key username@host`
- Check the Actions tab for detailed error messages

### Bot doesn't restart after VPS reboot
- Make sure you ran `pm2 startup` and `pm2 save`
- Check: `systemctl status pm2-<username>`

## Security Notes

- Never commit your `.env` file to git
- Keep your SSH keys secure
- Consider using a dedicated SSH key for GitHub Actions
- Regularly update your dependencies: `npm update`
