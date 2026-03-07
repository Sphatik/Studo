# AGENTS.md — Studo Discord Bot

## Project Overview

Studo is a Discord bot for study communities. It tracks LeetCode submissions, logs study sessions, and runs Pomodoro timers with TTS voice announcements. Built with discord.js v14, Sequelize (SQLite), and TypeScript.

## Tech Stack

- **Runtime**: Node.js with `tsx` for direct TS/JS execution
- **Language**: TypeScript (mixed with some legacy `.js` files)
- **Database**: SQLite via Sequelize ORM
- **Testing**: Vitest
- **Process manager**: pm2 (production)
- **Voice**: `@discordjs/voice` + Google TTS (cached to `tts_cache/`)

## Project Structure

```
src/
  bot.ts                        # Entry point: Discord client setup, event registration
  register.js                   # Slash command registration script (run once)
  scheduler.js                  # node-cron jobs (daily LeetCode + study summaries)
  commands/
    leetcode.js                 # /leetcode command
    log.js                      # /log command
    pomodoro/
      pomodoro.ts               # /pomodoro command — all subcommands, timers, button handlers
  database/
    index.ts                    # Sequelize init, model registration, associations
    models/
      User.ts
      Submission.ts
      StudyLog.ts
      VoiceSession.ts
      ServerConfig.ts
      PomodoroSession.ts        # Active pomodoro session (participants, duration, timers)
      PomodoroCycle.ts          # Per-user completed cycle records (for leaderboard)
  events/
    messageCreate.js
    voiceStateUpdate.js
  utils/
    voice.ts                    # joinVC, leaveVC, speakTTSCached, TTS file cache
    cooldown.ts
tests/
  setup.ts                      # Global vi.mock for database and voice modules
  mocks/
    discord.ts                  # createMockInteraction, createMockButtonInteraction, etc.
    database.ts                 # createMockSession
    speaker.ts                  # createMockSpeaker (implements IPomodoroSpeaker)
  unit/pomodoro/                # Unit tests for embeds, timer logic, leaderboard queries
  integration/pomodoro/         # Integration tests for full command flows
```

## Key Architecture Patterns

### Pomodoro Command (`src/commands/pomodoro/pomodoro.ts`)

This is the most complex module. Key exports:

- `execute(interaction)` — handles all `/pomodoro` subcommands
- `handleButtonInteraction(interaction, client)` — handles Stop/Skip/Join/Leave buttons
- `initPomodoroSpeaker(client)` — wires up TTS speaker on bot ready
- `setPomodoroSpeaker(speaker)` — injectable for testing
- `restoreTimers(client)` — on startup, restores timers for active sessions from DB
- `activeTimers` / `breakTimers` — exported Maps (keyed by `guildId`) for testing

### Speaker Interface (`IPomodoroSpeaker`)

```ts
interface IPomodoroSpeaker {
  playStart(session): void;
  playComplete(session): void;
  playSkipToBreak(session): void;
  playBreakComplete(session): void;
}
```

The real implementation uses `speakTTSCached` from `utils/voice.ts`. Tests inject a mock speaker via `setPomodoroSpeaker`.

### Database Models

- `PomodoroSession`: one active session per guild channel; `participants` is a JSON-serialized string array stored as TEXT
- `PomodoroCycle`: one record per user per completed session; used for leaderboard aggregation
- Associations: `User` hasMany `Submission`, `StudyLog`, `VoiceSession`

### TTS Voice Cache

TTS files are downloaded once from Google Translate and cached in `tts_cache/` as MP3s. `loadTTSCache()` is called at startup to populate the in-memory lookup map.

## Running the Bot

```bash
# Development
npm run bot           # tsx src/bot.ts

# Register slash commands (run after adding/changing commands)
npm run register

# Production (pm2)
npm run start
npm run logs
npm run restart
```

## Testing

```bash
npm test              # vitest run (all tests)
npm run test:watch    # watch mode
npm run test:coverage
```

### Test Setup

- `tests/setup.ts` is the global setup file — it mocks `src/database/index.js` and `src/utils/voice.js` for all tests
- Every test file imports mocks from `tests/mocks/` rather than duplicating mock logic

### Writing Tests

**Always use the shared mock factories:**

```ts
import { createMockInteraction, createMockButtonInteraction } from '../../mocks/discord.js';
import { createMockSession } from '../../mocks/database.js';
import { createMockSpeaker } from '../../mocks/speaker.js';
```

**Standard integration test pattern:**

```ts
beforeEach(() => {
  vi.useFakeTimers();
  activeTimers.clear();
  breakTimers.clear();
  setPomodoroSpeaker(createMockSpeaker());
});

afterEach(() => {
  vi.useRealTimers();
  activeTimers.clear();
  breakTimers.clear();
});
```

**Fake timers:** Use `vi.useFakeTimers()` / `vi.advanceTimersByTimeAsync(ms)` for pomodoro timer tests. Timers are set with `setTimeout` internally.

**Database mocks:** `PomodoroSession` and `PomodoroCycle` are vi-mocked at the module level in `setup.ts`. Cast them to get typed access to mock methods:

```ts
const mockSession = PomodoroSession as unknown as { create: ReturnType<typeof vi.fn>; findOne: ReturnType<typeof vi.fn> };
```

### Test File Locations

| Type | Path |
|------|------|
| Unit | `tests/unit/pomodoro/*.test.ts` |
| Integration | `tests/integration/pomodoro/*.test.ts` |

## Environment Variables

Requires a `.env` file:

```
TOKEN=<discord bot token>
```

Other config (guild IDs, channel IDs for summaries) is stored per-guild in `ServerConfig` DB records.

## Common Pitfalls

- **`participants` field**: stored as JSON string in SQLite. The Sequelize model has custom `get`/`set` accessors. Never write raw JSON yourself; always assign a `string[]` and let the model handle serialization.
- **`restoreTimers`**: called at bot startup to re-arm `setTimeout` for sessions that were active when the bot last shut down. If you modify timer logic, verify this path still works.
- **Mixed JS/TS**: Legacy files (`scheduler.js`, `commands/leetcode.js`, etc.) use CommonJS-style imports but the project is `"type": "module"`. Keep new code as `.ts`.
- **No foreign key on PomodoroCycle → User**: cycles record `userDiscordId` but there is no Sequelize association defined. Queries aggregate directly.
- **TTS cache is filesystem state**: tests mock `speakTTSCached` entirely; never let tests hit the real TTS system.
