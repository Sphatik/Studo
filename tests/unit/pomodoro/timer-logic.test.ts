import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PomodoroSession, PomodoroCycle } from '../../../src/database/index.js';
import {
    scheduleTimer,
    completeTimer,
    completeBreak,
    activeTimers,
    breakTimers,
    setPomodoroSpeaker,
} from '../../../src/commands/pomodoro/pomodoro.js';
import { createMockSession } from '../../mocks/database.js';
import { createMockClient, createMockTextChannel } from '../../mocks/discord.js';
import { createMockSpeaker } from '../../mocks/speaker.js';

const mockPomodoroSession = PomodoroSession as unknown as {
    findByPk: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
};
const mockPomodoroCycle = PomodoroCycle as unknown as {
    bulkCreate: ReturnType<typeof vi.fn>;
};

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

describe('scheduleTimer', () => {
    it('stores timer in activeTimers with correct key', () => {
        const session = createMockSession();
        const client = createMockClient();
        scheduleTimer(session, client);
        expect(activeTimers.has('guild-789_channel-456')).toBe(true);
    });

    it('calls completeTimer immediately if endsAt is in the past', async () => {
        const pastEndsAt = new Date(Date.now() - 1000);
        const session = createMockSession({ endsAt: pastEndsAt, isActive: true });
        mockPomodoroSession.findByPk.mockResolvedValue({ ...session, save: vi.fn() });
        mockPomodoroCycle.bulkCreate.mockResolvedValue([]);

        const sendFn = vi.fn().mockResolvedValue(undefined);
        const client = createMockClient(sendFn);

        scheduleTimer(session, client);
        await vi.runAllTimersAsync();

        expect(mockPomodoroSession.findByPk).toHaveBeenCalledWith(1);
    });

    it('fires after the correct delay', async () => {
        const endsAt = new Date(Date.now() + 25 * 60 * 1000);
        const session = createMockSession({ endsAt, isActive: true });
        const completedSession = { ...session, isActive: true, save: vi.fn() };
        mockPomodoroSession.findByPk.mockResolvedValue(completedSession);
        mockPomodoroCycle.bulkCreate.mockResolvedValue([]);

        const sendFn = vi.fn().mockResolvedValue(undefined);
        const client = createMockClient(sendFn);

        scheduleTimer(session, client);
        expect(activeTimers.has('guild-789_channel-456')).toBe(true);

        await vi.advanceTimersByTimeAsync(25 * 60 * 1000);

        expect(mockPomodoroSession.findByPk).toHaveBeenCalledWith(1);
    });
});

describe('completeTimer', () => {
    it('removes timer from activeTimers', async () => {
        const session = createMockSession({ isActive: true });
        const sessionFromDb = { ...session, save: vi.fn() };
        mockPomodoroSession.findByPk.mockResolvedValue(sessionFromDb);
        mockPomodoroCycle.bulkCreate.mockResolvedValue([]);

        activeTimers.set('guild-789_channel-456', setTimeout(() => {}, 99999));
        const sendFn = vi.fn().mockResolvedValue(undefined);
        const client = createMockClient(sendFn);

        await completeTimer(session, client);

        expect(activeTimers.has('guild-789_channel-456')).toBe(false);
    });

    it('sets isActive=false and saves', async () => {
        const session = createMockSession({ isActive: true });
        const saveFn = vi.fn().mockResolvedValue(undefined);
        const sessionFromDb = { ...session, isActive: true, save: saveFn };
        mockPomodoroSession.findByPk.mockResolvedValue(sessionFromDb);
        mockPomodoroCycle.bulkCreate.mockResolvedValue([]);

        const client = createMockClient();
        await completeTimer(session, client);

        expect(sessionFromDb.isActive).toBe(false);
        expect(saveFn).toHaveBeenCalled();
    });

    it('creates PomodoroCycle records for all participants', async () => {
        const session = createMockSession({ participants: ['user-1', 'user-2'], duration: 25 });
        const sessionFromDb = { ...session, isActive: true, save: vi.fn() };
        mockPomodoroSession.findByPk.mockResolvedValue(sessionFromDb);
        mockPomodoroCycle.bulkCreate.mockResolvedValue([]);

        const client = createMockClient();
        await completeTimer(session, client);

        expect(mockPomodoroCycle.bulkCreate).toHaveBeenCalledWith([
            { userDiscordId: 'user-1', guildId: 'guild-789', duration: 25, sessionId: 1 },
            { userDiscordId: 'user-2', guildId: 'guild-789', duration: 25, sessionId: 1 },
        ]);
    });

    it('does nothing if session was already stopped', async () => {
        const session = createMockSession({ isActive: false });
        const sessionFromDb = { ...session, isActive: false, save: vi.fn() };
        mockPomodoroSession.findByPk.mockResolvedValue(sessionFromDb);

        const client = createMockClient();
        await completeTimer(session, client);

        expect(mockPomodoroCycle.bulkCreate).not.toHaveBeenCalled();
    });

    it('does nothing if session not found in DB', async () => {
        const session = createMockSession();
        mockPomodoroSession.findByPk.mockResolvedValue(null);

        const client = createMockClient();
        await completeTimer(session, client);

        expect(mockPomodoroCycle.bulkCreate).not.toHaveBeenCalled();
    });

    it('sends completion embed to the text channel', async () => {
        const session = createMockSession({ isActive: true });
        const sessionFromDb = { ...session, isActive: true, save: vi.fn() };
        mockPomodoroSession.findByPk.mockResolvedValue(sessionFromDb);
        mockPomodoroCycle.bulkCreate.mockResolvedValue([]);

        const sendFn = vi.fn().mockResolvedValue(undefined);
        const client = createMockClient(sendFn);

        await completeTimer(session, client);

        expect(sendFn).toHaveBeenCalled();
    });
});

describe('completeBreak', () => {
    it('sends break-over embed to channel when no new session exists', async () => {
        const session = createMockSession();
        mockPomodoroSession.findOne.mockResolvedValue(null);

        const sendFn = vi.fn().mockResolvedValue(undefined);
        const client = createMockClient(sendFn);

        await completeBreak(session, client);

        expect(sendFn).toHaveBeenCalled();
    });

    it('suppresses message if a new active session already exists', async () => {
        const session = createMockSession();
        mockPomodoroSession.findOne.mockResolvedValue(createMockSession({ id: 99 }));

        const sendFn = vi.fn().mockResolvedValue(undefined);
        const client = createMockClient(sendFn);

        await completeBreak(session, client);

        expect(sendFn).not.toHaveBeenCalled();
    });

    it('plays TTS when voiceChannelId is set', async () => {
        const speaker = createMockSpeaker();
        setPomodoroSpeaker(speaker);

        const session = createMockSession({ voiceChannelId: 'vc-123' });
        mockPomodoroSession.findOne.mockResolvedValue(null);

        const client = createMockClient();
        await completeBreak(session, client);

        expect(speaker.playBreakComplete).toHaveBeenCalledWith(session);
    });
});

describe('timer key format', () => {
    it('uses guildId_channelId as the key', () => {
        const session = createMockSession({ guildId: 'g-1', channelId: 'c-2' });
        const client = createMockClient();
        scheduleTimer(session, client);
        expect(activeTimers.has('g-1_c-2')).toBe(true);
    });
});
