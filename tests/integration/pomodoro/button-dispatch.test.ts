import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PomodoroSession } from '../../../src/database/index.js';
import { handleButtonInteraction, activeTimers, breakTimers, setPomodoroSpeaker } from '../../../src/commands/pomodoro/pomodoro.js';
import { createMockButtonInteraction } from '../../mocks/discord.js';
import { createMockSession } from '../../mocks/database.js';
import { createMockSpeaker } from '../../mocks/speaker.js';

const mockPomodoroSession = PomodoroSession as unknown as {
    findByPk: ReturnType<typeof vi.fn>;
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

describe('handleButtonInteraction dispatch', () => {
    it('routes pomodoro-join correctly', async () => {
        const session = createMockSession({ id: 1, participants: ['creator'] });
        mockPomodoroSession.findByPk.mockResolvedValue(session);

        const interaction = createMockButtonInteraction('pomodoro-join_1', { userId: 'new-user' });
        await handleButtonInteraction(interaction, interaction.client);

        expect(session.participants).toContain('new-user');
    });

    it('returns undefined for non-pomodoro button IDs', async () => {
        mockPomodoroSession.findByPk.mockResolvedValue(null);
        const interaction = createMockButtonInteraction('other-button_123');
        const result = await handleButtonInteraction(interaction, interaction.client);

        expect(result).toBeUndefined();
        expect(interaction.reply).not.toHaveBeenCalled();
        expect(interaction.update).not.toHaveBeenCalled();
    });

    it('pomodoro-end works without session lookup', async () => {
        const interaction = createMockButtonInteraction('pomodoro-end_999');
        // findByPk is still called for non-end actions, but end action returns early
        mockPomodoroSession.findByPk.mockResolvedValue(null);

        await handleButtonInteraction(interaction, interaction.client);

        expect(interaction.update).toHaveBeenCalled();
    });

    it('invalid session ID replies "no longer active"', async () => {
        mockPomodoroSession.findByPk.mockResolvedValue(null);

        const interaction = createMockButtonInteraction('pomodoro-join_99999');
        await handleButtonInteraction(interaction, interaction.client);

        const replyArg = (interaction.reply as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(replyArg.ephemeral).toBe(true);
        expect(replyArg.content).toContain('no longer active');
    });

    it('pomodoro-leave routes to leave handler', async () => {
        const session = createMockSession({ id: 1, participants: ['user-123', 'user-456'] });
        mockPomodoroSession.findByPk.mockResolvedValue(session);

        const interaction = createMockButtonInteraction('pomodoro-leave_1', { userId: 'user-123' });
        await handleButtonInteraction(interaction, interaction.client);

        expect(session.participants).not.toContain('user-123');
    });
});
