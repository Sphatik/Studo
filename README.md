# Studo

A Discord bot for study servers. Tracks LeetCode submissions, logs study sessions, monitors voice channel time, and runs collaborative Pomodoro timers with voice announcements.

## Features

### Pomodoro Timer (`/pomodoro`)
Collaborative, channel-based Pomodoro sessions with optional voice channel TTS announcements.

| Subcommand | Description |
|---|---|
| `start [duration] [break] [voice]` | Start a session (default: 25min work / 5min break) |
| `join` | Join the active session in the channel |
| `leave` | Leave the current session |
| `stop` | Stop the session (creator only) |
| `status` | Check the current session status |
| `leaderboard [timeframe]` | View completed cycles — all-time or today |

Sessions persist across bot restarts. When a timer ends, participants are pinged and can start a break or jump into another round via buttons.

### LeetCode Tracking (`/leetcode`)
Automatically tracks LeetCode problem links posted in a configured channel.

| Subcommand | Description |
|---|---|
| `stats [user]` | View solved count and recent submissions |
| `leaderboard` | Server-wide problem count rankings |
| `today` | See who solved problems today |
| `setchannel` | Set the tracking channel (admin) |
| `purge` | Remove submissions with invalid LeetCode links (admin) |

### Study Logging (`/log`)
Log study activity and track voice channel time.

| Subcommand | Description |
|---|---|
| `add <activity>` | Log what you're working on |
| `today` | View today's study activity for the server |
| `stats [user]` | View personal study stats (today and this week) |
| `summary` | Preview the daily summary |
| `setcategory` | Set the study voice channel category (admin) |
| `setchannel` | Set the channel for daily summaries (admin) |

Voice time is automatically tracked when members join/leave channels under the configured study category. A daily summary is posted each evening.

## Setup

### Prerequisites
- Node.js 18+
- A Discord bot token with the following intents: `Guilds`, `GuildMessages`, `MessageContent`, `GuildVoiceStates`

### Installation

```bash
git clone <repo-url>
cd studo
npm install
```

### Configuration

Create a `.env` file in the project root:

```env
TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_application_id
```

### Register Slash Commands

```bash
npm run register
```

### Run

```bash
# Development
npm run bot

# Production (via PM2)
npm start
```

Other PM2 commands:

```bash
npm run stop
npm run restart
npm run logs
npm run status
```

## Tech Stack

- [discord.js](https://discord.js.org/) v14
- [Sequelize](https://sequelize.org/) with SQLite
- [@discordjs/voice](https://github.com/discordjs/voice) + Google TTS for voice announcements
- TypeScript + tsx
- Vitest for testing

## Development

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Type check
npm run typecheck
```
