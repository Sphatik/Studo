import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PomodoroSession } from '../../../src/database/index.js';
import { execute, activeTimers, setPomodoroSpeaker } from '../../../src/commands/pomodoro/pomodoro.js';
import { createMockInteraction } from '../../mocks/discord.js';
import { createMockSession } from '../../mocks/database.js';
import { createMockSpeaker } from '../../mocks/speaker.js';

const mockSession = PomodoroSession as unknown as {
    findOne: ReturnType<typeof vi.fn>;
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

describe('/pomodoro stop', () => {
    it('creator can stop: deactivates session and clears timer', async () => {
        const session = createMockSession({ creatorId: 'creator-111' });
        mockSession.findOne.mockResolvedValue(session);
        const timerId = setTimeout(() => {}, 99999);
        activeTimers.set('guild-789_channel-456', timerId);

        const interaction = createMockInteraction({ subcommand: 'stop', userId: 'creator-111' });
        await execute(interaction);

        expect(session.isActive).toBe(false);
        expect(session.save).toHaveBeenCalled();
        expect(activeTimers.has('guild-789_channel-456')).toBe(false);
        expect(interaction.reply).toHaveBeenCalled();
    });

    it('non-creator cannot stop', async () => {
        const session = createMockSession({ creatorId: 'creator-111' });
        mockSession.findOne.mockResolvedValue(session);

        const interaction = createMockInteraction({ subcommand: 'stop', userId: 'intruder-999' });
        await execute(interaction);

        expect(session.isActive).toBe(true);
        expect(session.save).not.toHaveBeenCalled();
        const replyArg = (interaction.reply as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(replyArg.ephemeral).toBe(true);
        expect(replyArg.content).toContain('Only the person who started');
    });

    it('replies with error when no active session', async () => {
        mockSession.findOne.mockResolvedValue(null);

        const interaction = createMockInteraction({ subcommand: 'stop' });
        await execute(interaction);

        const replyArg = (interaction.reply as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(replyArg.ephemeral).toBe(true);
    });
});
