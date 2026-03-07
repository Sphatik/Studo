import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PomodoroSession, PomodoroCycle } from '../../../src/database/index.js';
import { handleButtonInteraction, activeTimers, breakTimers, setPomodoroSpeaker } from '../../../src/commands/pomodoro/pomodoro.js';
import { createMockButtonInteraction, createMockClient } from '../../mocks/discord.js';
import { createMockSession } from '../../mocks/database.js';
import { createMockSpeaker } from '../../mocks/speaker.js';

const mockPomodoroSession = PomodoroSession as unknown as {
    findByPk: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
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

describe('pomodoro-break button (start break)', () => {
    it('sets breakTimers entry and shows break-active embed', async () => {
        const session = createMockSession({ id: 1, breakDuration: 5 });
        mockPomodoroSession.findByPk.mockResolvedValue(session);

        const interaction = createMockButtonInteraction('pomodoro-break_1');
        await handleButtonInteraction(interaction, interaction.client);

        expect(breakTimers.has('break_guild-789_channel-456')).toBe(true);
        expect(interaction.update).toHaveBeenCalled();
    });

    it('rejects duplicate break start', async () => {
        const session = createMockSession({ id: 1 });
        mockPomodoroSession.findByPk.mockResolvedValue(session);
        breakTimers.set('break_guild-789_channel-456', setTimeout(() => {}, 99999));

        const interaction = createMockButtonInteraction('pomodoro-break_1');
        await handleButtonInteraction(interaction, interaction.client);

        const replyArg = (interaction.reply as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(replyArg.ephemeral).toBe(true);
        expect(replyArg.content).toContain('already running');
    });

    it('calls completeBreak when break timer expires', async () => {
        const session = createMockSession({ id: 1, breakDuration: 5 });
        mockPomodoroSession.findByPk.mockResolvedValue(session);
        mockPomodoroSession.findOne.mockResolvedValue(null); // no new session

        const sendFn = vi.fn().mockResolvedValue(undefined);
        const client = createMockClient(sendFn);

        const interaction = createMockButtonInteraction('pomodoro-break_1');
        Object.defineProperty(interaction, 'client', { value: client, writable: true });
        await handleButtonInteraction(interaction, client);

        await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

        expect(sendFn).toHaveBeenCalled();
    });
});

describe('pomodoro-skiptobreak button', () => {
    it('clears active timer and does NOT log cycles', async () => {
        const session = createMockSession({ id: 1, isActive: true });
        mockPomodoroSession.findByPk.mockResolvedValue(session);
        const timerId = setTimeout(() => {}, 99999);
        activeTimers.set('guild-789_channel-456', timerId);

        const interaction = createMockButtonInteraction('pomodoro-skiptobreak_1');
        await handleButtonInteraction(interaction, interaction.client);

        expect(activeTimers.has('guild-789_channel-456')).toBe(false);
        expect(mockPomodoroCycle.bulkCreate).not.toHaveBeenCalled();
        expect(session.isActive).toBe(false);
    });
});

describe('pomodoro-skipbreak button', () => {
    it('cancels break timer and starts new pomodoro', async () => {
        const session = createMockSession({ id: 1 });
        mockPomodoroSession.findByPk.mockResolvedValue(session);

        const breakId = setTimeout(() => {}, 99999);
        breakTimers.set('break_guild-789_channel-456', breakId);

        const newSession = createMockSession({ id: 2 });
        mockPomodoroSession.create.mockResolvedValue(newSession);

        const interaction = createMockButtonInteraction('pomodoro-skipbreak_1');
        await handleButtonInteraction(interaction, interaction.client);

        expect(breakTimers.has('break_guild-789_channel-456')).toBe(false);
        expect(mockPomodoroSession.create).toHaveBeenCalled();
        expect(interaction.update).toHaveBeenCalled();
    });
});
