import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PomodoroSession } from '../../../src/database/index.js';
import { handleButtonInteraction, activeTimers, breakTimers, setPomodoroSpeaker } from '../../../src/commands/pomodoro/pomodoro.js';
import { createMockButtonInteraction } from '../../mocks/discord.js';
import { createMockSession } from '../../mocks/database.js';
import { createMockSpeaker } from '../../mocks/speaker.js';

const mockPomodoroSession = PomodoroSession as unknown as {
    findByPk: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
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

describe('pomodoro-repeat button', () => {
    it('creates new session with same settings', async () => {
        const session = createMockSession({
            id: 1,
            duration: 30,
            breakDuration: 10,
            participants: ['user-a', 'user-b'],
            voiceChannelId: 'vc-777',
        });
        mockPomodoroSession.findByPk.mockResolvedValue(session);
        const newSession = createMockSession({ id: 2 });
        mockPomodoroSession.create.mockResolvedValue(newSession);

        const interaction = createMockButtonInteraction('pomodoro-repeat_1');
        await handleButtonInteraction(interaction, interaction.client);

        expect(mockPomodoroSession.create).toHaveBeenCalledWith(
            expect.objectContaining({
                duration: 30,
                breakDuration: 10,
                participants: ['user-a', 'user-b'],
                voiceChannelId: 'vc-777',
                isActive: true,
            })
        );
    });

    it('cancels running break timer before starting new session', async () => {
        const session = createMockSession({ id: 1 });
        mockPomodoroSession.findByPk.mockResolvedValue(session);
        const newSession = createMockSession({ id: 2 });
        mockPomodoroSession.create.mockResolvedValue(newSession);

        const breakId = setTimeout(() => {}, 99999);
        breakTimers.set('break_guild-789_channel-456', breakId);

        const interaction = createMockButtonInteraction('pomodoro-repeat_1');
        await handleButtonInteraction(interaction, interaction.client);

        expect(breakTimers.has('break_guild-789_channel-456')).toBe(false);
    });

    it('rejects if active timer already exists in channel', async () => {
        const session = createMockSession({ id: 1 });
        mockPomodoroSession.findByPk.mockResolvedValue(session);
        activeTimers.set('guild-789_channel-456', setTimeout(() => {}, 99999));

        const interaction = createMockButtonInteraction('pomodoro-repeat_1');
        await handleButtonInteraction(interaction, interaction.client);

        expect(mockPomodoroSession.create).not.toHaveBeenCalled();
        const replyArg = (interaction.reply as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(replyArg.ephemeral).toBe(true);
    });

    it('calls playStart on speaker', async () => {
        const speaker = createMockSpeaker();
        setPomodoroSpeaker(speaker);

        const session = createMockSession({ id: 1 });
        mockPomodoroSession.findByPk.mockResolvedValue(session);
        const newSession = createMockSession({ id: 2 });
        mockPomodoroSession.create.mockResolvedValue(newSession);

        const interaction = createMockButtonInteraction('pomodoro-repeat_1');
        await handleButtonInteraction(interaction, interaction.client);

        expect(speaker.playStart).toHaveBeenCalledWith(newSession);
    });
});
