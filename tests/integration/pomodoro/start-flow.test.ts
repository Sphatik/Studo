import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PomodoroSession } from '../../../src/database/index.js';
import { execute, activeTimers, setPomodoroSpeaker } from '../../../src/commands/pomodoro/pomodoro.js';
import { createMockInteraction } from '../../mocks/discord.js';
import { createMockSession } from '../../mocks/database.js';
import { createMockSpeaker } from '../../mocks/speaker.js';

const mockSession = PomodoroSession as unknown as {
    create: ReturnType<typeof vi.fn>;
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

describe('/pomodoro start', () => {
    it('creates session with default 25min/5min when no options provided', async () => {
        mockSession.findOne.mockResolvedValue(null);
        const created = createMockSession();
        mockSession.create.mockResolvedValue(created);

        const interaction = createMockInteraction({ subcommand: 'start' });
        await execute(interaction);

        expect(mockSession.create).toHaveBeenCalledWith(
            expect.objectContaining({ duration: 25, breakDuration: 5 })
        );
        expect(interaction.reply).toHaveBeenCalled();
    });

    it('uses custom duration and break values', async () => {
        mockSession.findOne.mockResolvedValue(null);
        const created = createMockSession({ duration: 50, breakDuration: 10 });
        mockSession.create.mockResolvedValue(created);

        const interaction = createMockInteraction({ subcommand: 'start', duration: 50, breakDuration: 10 });
        await execute(interaction);

        expect(mockSession.create).toHaveBeenCalledWith(
            expect.objectContaining({ duration: 50, breakDuration: 10 })
        );
    });

    it('calculates endsAt as startedAt + duration * 60 * 1000', async () => {
        const now = new Date(2024, 0, 1, 12, 0, 0);
        vi.setSystemTime(now);

        mockSession.findOne.mockResolvedValue(null);
        const created = createMockSession();
        mockSession.create.mockResolvedValue(created);

        const interaction = createMockInteraction({ subcommand: 'start', duration: 25 });
        await execute(interaction);

        const createCall = mockSession.create.mock.calls[0][0];
        const expectedEndsAt = new Date(now.getTime() + 25 * 60 * 1000);
        expect(createCall.endsAt.getTime()).toBeCloseTo(expectedEndsAt.getTime(), -2);
    });

    it('adds creator to participants array', async () => {
        mockSession.findOne.mockResolvedValue(null);
        const created = createMockSession();
        mockSession.create.mockResolvedValue(created);

        const interaction = createMockInteraction({ subcommand: 'start', userId: 'creator-111' });
        await execute(interaction);

        expect(mockSession.create).toHaveBeenCalledWith(
            expect.objectContaining({ participants: ['creator-111'] })
        );
    });

    it('replies with embed and buttons on success', async () => {
        mockSession.findOne.mockResolvedValue(null);
        const created = createMockSession();
        mockSession.create.mockResolvedValue(created);

        const interaction = createMockInteraction({ subcommand: 'start' });
        await execute(interaction);

        const replyArg = (interaction.reply as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(replyArg.embeds).toHaveLength(1);
        expect(replyArg.components).toHaveLength(1);
    });

    it('sets voiceChannelId when voice option provided', async () => {
        mockSession.findOne.mockResolvedValue(null);
        const created = createMockSession({ voiceChannelId: 'vc-888' });
        mockSession.create.mockResolvedValue(created);

        const interaction = createMockInteraction({ subcommand: 'start', voiceChannel: { id: 'vc-888' } });
        await execute(interaction);

        expect(mockSession.create).toHaveBeenCalledWith(
            expect.objectContaining({ voiceChannelId: 'vc-888' })
        );
    });

    it('calls playStart on speaker when voice channel is provided', async () => {
        const speaker = createMockSpeaker();
        setPomodoroSpeaker(speaker);
        mockSession.findOne.mockResolvedValue(null);
        const created = createMockSession({ voiceChannelId: 'vc-888' });
        mockSession.create.mockResolvedValue(created);

        const interaction = createMockInteraction({ subcommand: 'start', voiceChannel: { id: 'vc-888' } });
        await execute(interaction);

        expect(speaker.playStart).toHaveBeenCalledWith(created);
    });

    it('does not call playStart when no voice channel', async () => {
        const speaker = createMockSpeaker();
        setPomodoroSpeaker(speaker);
        mockSession.findOne.mockResolvedValue(null);
        const created = createMockSession({ voiceChannelId: null });
        mockSession.create.mockResolvedValue(created);

        const interaction = createMockInteraction({ subcommand: 'start' });
        await execute(interaction);

        expect(speaker.playStart).not.toHaveBeenCalled();
    });

    it('rejects if active session already exists in channel', async () => {
        mockSession.findOne.mockResolvedValue(createMockSession());

        const interaction = createMockInteraction({ subcommand: 'start' });
        await execute(interaction);

        expect(mockSession.create).not.toHaveBeenCalled();
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ ephemeral: true })
        );
    });
});
