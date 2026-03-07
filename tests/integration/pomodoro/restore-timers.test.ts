import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PomodoroSession, PomodoroCycle } from '../../../src/database/index.js';
import { restoreTimers, activeTimers, setPomodoroSpeaker } from '../../../src/commands/pomodoro/pomodoro.js';
import { createMockClient } from '../../mocks/discord.js';
import { createMockSession } from '../../mocks/database.js';
import { createMockSpeaker } from '../../mocks/speaker.js';

const mockPomodoroSession = PomodoroSession as unknown as {
    findAll: ReturnType<typeof vi.fn>;
    findByPk: ReturnType<typeof vi.fn>;
};
const mockPomodoroCycle = PomodoroCycle as unknown as {
    bulkCreate: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
    vi.useFakeTimers();
    activeTimers.clear();
    setPomodoroSpeaker(createMockSpeaker());
});

afterEach(() => {
    vi.useRealTimers();
    activeTimers.clear();
});

describe('restoreTimers', () => {
    it('schedules timers for sessions with future endsAt', async () => {
        const futureEndsAt = new Date(Date.now() + 10 * 60 * 1000);
        const session = createMockSession({ endsAt: futureEndsAt });
        mockPomodoroSession.findAll.mockResolvedValue([session]);

        const client = createMockClient();
        await restoreTimers(client);

        expect(activeTimers.has('guild-789_channel-456')).toBe(true);
    });

    it('completes sessions with past endsAt immediately', async () => {
        const pastEndsAt = new Date(Date.now() - 5000);
        const session = createMockSession({ endsAt: pastEndsAt, isActive: true });
        const sessionFromDb = { ...session, isActive: true, save: vi.fn() };
        mockPomodoroSession.findAll.mockResolvedValue([session]);
        mockPomodoroSession.findByPk.mockResolvedValue(sessionFromDb);
        mockPomodoroCycle.bulkCreate.mockResolvedValue([]);

        const sendFn = vi.fn().mockResolvedValue(undefined);
        const client = createMockClient(sendFn);
        await restoreTimers(client);

        expect(mockPomodoroSession.findByPk).toHaveBeenCalledWith(1);
    });

    it('handles zero active sessions gracefully', async () => {
        mockPomodoroSession.findAll.mockResolvedValue([]);

        const client = createMockClient();
        await expect(restoreTimers(client)).resolves.not.toThrow();
        expect(activeTimers.size).toBe(0);
    });

    it('schedules multiple sessions', async () => {
        const futureEndsAt1 = new Date(Date.now() + 10 * 60 * 1000);
        const futureEndsAt2 = new Date(Date.now() + 20 * 60 * 1000);
        const s1 = createMockSession({ id: 1, guildId: 'g-1', channelId: 'c-1', endsAt: futureEndsAt1 });
        const s2 = createMockSession({ id: 2, guildId: 'g-2', channelId: 'c-2', endsAt: futureEndsAt2 });
        mockPomodoroSession.findAll.mockResolvedValue([s1, s2]);

        const client = createMockClient();
        await restoreTimers(client);

        expect(activeTimers.has('g-1_c-1')).toBe(true);
        expect(activeTimers.has('g-2_c-2')).toBe(true);
    });
});
