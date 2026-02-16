<div align="center">

# Studo Bot - Discord Study Companion

[![Node.js](https://img.shields.io/badge/Node.js-24.9.0-ffb86c?logo=node.js&logoColor=white&labelColor=6272a4)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-14.25.1-ff79c6?logo=discord&logoColor=white&labelColor=6272a4)](https://discord.js.org/)
[![pre-commit](https://img.shields.io/badge/pre--commit-4.5.1-50fa7b?logo=pre-commit&logoColor=282a36&labelColor=6272a4)](https://github.com/pre-commit/pre-commit)
[![ESLint](https://img.shields.io/badge/ESLint-9.18.0-8be9fd?logo=eslint&logoColor=white&labelColor=6272a4)](https://eslint.org/)
[![Prettier](https://img.shields.io/badge/Prettier-3.4.2-f1fa8c?logo=prettier&logoColor=282a36&labelColor=6272a4)](https://prettier.io/)

---

A Discord bot for study groups with LeetCode tracking, Pomodoro timers,
study logging, and voice session management.

---

</div>

## Features

- **LeetCode Tracking** - Automatic problem submission tracking with leaderboards
- **Pomodoro Timer** - Focus sessions with customizable work/break intervals
- **Study Logging** - Track study hours and generate weekly reports
- **Voice Sessions** - Automatic voice channel session tracking
- **Scheduled Tasks** - Daily LeetCode reminders and weekly reports

## Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd Studo

# Run development setup (installs pre-commit hooks and dependencies)
npm run dev-setup

# Configure environment
cp .env.example .env
# Edit .env with your Discord bot token and client ID

# Register slash commands
npm run register

# Start the bot
npm run bot
```

## Development Setup

For new developers setting up the project:

```bash
npm run dev-setup
```

This single command will:
- ✅ Check/install pre-commit framework
- ✅ Install all npm dependencies (ESLint, Prettier)
- ✅ Install Git hooks
- ✅ Validate the setup

## Available Commands

### Bot Management

```bash
npm run bot         # Run bot in development
npm run register    # Register Discord slash commands
npm run start       # Start with PM2 (production)
npm run stop        # Stop PM2 process
npm run restart     # Restart PM2 process
npm run logs        # View PM2 logs
npm run status      # Check PM2 status
npm run deploy      # Deploy to VPS
```

### Development Tools

```bash
npm run dev-setup      # Run full development environment setup
npm run lint           # Run ESLint on src/
npm run lint:fix       # Run ESLint and auto-fix issues
npm run format         # Format all files with Prettier
npm run format:check   # Check formatting without changes
npm run precommit      # Manually run all pre-commit hooks
```

## Pre-commit Hooks

The following checks run automatically on every commit:

### Code Quality
- **ESLint** - JavaScript linting and code quality checks
- **Prettier** - Automatic code formatting

### Security
- **detect-secrets** - Prevents committing secrets and credentials
- **detect-private-key** - Blocks private SSH/API keys

### File Integrity
- **trailing-whitespace** - Removes trailing whitespace
- **end-of-file-fixer** - Ensures files end with newline
- **check-yaml** - Validates YAML syntax
- **check-json** - Validates JSON syntax
- **check-merge-conflict** - Detects merge conflict markers
- **check-added-large-files** - Prevents large files (>1MB)
- **mixed-line-ending** - Ensures consistent line endings (LF)

## Configuration Files

| File                        | Purpose                                     |
| --------------------------- | ------------------------------------------- |
| `.pre-commit-config.yaml`   | Pre-commit hook configuration               |
| `.eslintrc.json`            | ESLint rules for JavaScript                 |
| `.prettierrc.json`          | Prettier code formatting rules              |
| `.prettierignore`           | Files to exclude from formatting            |
| `.env.example`              | Example environment variables               |
| `ecosystem.config.cjs`      | PM2 process manager configuration           |

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions including:
- VPS setup with PM2
- GitHub Actions automatic deployment
- SSH configuration
- Environment setup

## Troubleshooting

### Pre-commit not found

If pre-commit is not installed automatically, install it manually:

```bash
# Using pip (Python)
pip3 install pre-commit

# Using Homebrew (macOS)
brew install pre-commit

# Then run setup again
npm run dev-setup
```

### Hooks not running

Re-install the hooks:

```bash
pre-commit install
```

### Skip hooks (use sparingly)

Only in emergencies:

```bash
git commit --no-verify -m "emergency fix"
```
