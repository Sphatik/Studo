import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PomodoroSession } from '../../../src/database/index.js';
import { execute, handleButtonInteraction, activeTimers, setPomodoroSpeaker } from '../../../src/commands/pomodoro/pomodoro.js';
import { createMockInteraction, createMockButtonInteraction } from '../../mocks/discord.js';
import { createMockSession } from '../../mocks/database.js';
import { createMockSpeaker } from '../../mocks/speaker.js';

const mockSession = PomodoroSession as unknown as {
    findOne: ReturnType<typeof vi.fn>;
    findByPk: ReturnType<typeof vi.fn>;
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

describe('/pomodoro join', () => {
    it('adds user to participants and saves', async () => {
        const session = createMockSession({ participants: ['creator-111'] });
        mockSession.findOne.mockResolvedValue(session);

        const interaction = createMockInteraction({ subcommand: 'join', userId: 'new-user-222' });
        await execute(interaction);

        expect(session.participants).toContain('new-user-222');
        expect(session.save).toHaveBeenCalled();
        expect(interaction.reply).toHaveBeenCalled();
    });

    it('rejects duplicate join', async () => {
        const session = createMockSession({ participants: ['user-123'] });
        mockSession.findOne.mockResolvedValue(session);

        const interaction = createMockInteraction({ subcommand: 'join', userId: 'user-123' });
        await execute(interaction);

        expect(session.save).not.toHaveBeenCalled();
        const replyArg = (interaction.reply as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(replyArg.ephemeral).toBe(true);
        expect(replyArg.content).toContain('already joined');
    });

    it('rejects if no active session', async () => {
        mockSession.findOne.mockResolvedValue(null);

        const interaction = createMockInteraction({ subcommand: 'join' });
        await execute(interaction);

        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ ephemeral: true })
        );
    });

    it('rejects if user not in required voice channel', async () => {
        const session = createMockSession({ voiceChannelId: 'vc-required', participants: ['creator'] });
        mockSession.findOne.mockResolvedValue(session);

        // user is in a different vc
        const interaction = createMockInteraction({
            subcommand: 'join',
            userId: 'new-user',
            memberVoiceChannelId: 'vc-other',
        });
        await execute(interaction);

        expect(session.save).not.toHaveBeenCalled();
        const replyArg = (interaction.reply as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(replyArg.ephemeral).toBe(true);
    });

    it('allows joining if user is in the correct voice channel', async () => {
        const session = createMockSession({ voiceChannelId: 'vc-required', participants: ['creator'] });
        mockSession.findOne.mockResolvedValue(session);

        const interaction = createMockInteraction({
            subcommand: 'join',
            userId: 'new-user',
            memberVoiceChannelId: 'vc-required',
        });
        await execute(interaction);

        expect(session.save).toHaveBeenCalled();
        expect(session.participants).toContain('new-user');
    });
});

describe('/pomodoro leave', () => {
    it('removes user from participants and saves', async () => {
        const session = createMockSession({ participants: ['user-123', 'user-456'] });
        mockSession.findOne.mockResolvedValue(session);

        const interaction = createMockInteraction({ subcommand: 'leave', userId: 'user-123' });
        await execute(interaction);

        expect(session.participants).not.toContain('user-123');
        expect(session.save).toHaveBeenCalled();
    });

    it('rejects if user is not a participant', async () => {
        const session = createMockSession({ participants: ['creator-111'] });
        mockSession.findOne.mockResolvedValue(session);

        const interaction = createMockInteraction({ subcommand: 'leave', userId: 'outsider-999' });
        await execute(interaction);

        const replyArg = (interaction.reply as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(replyArg.ephemeral).toBe(true);
        expect(replyArg.content).toContain("not part of");
    });

    it('ends session and clears timer when last participant leaves', async () => {
        const session = createMockSession({ participants: ['user-123'] });
        mockSession.findOne.mockResolvedValue(session);
        const timerId = setTimeout(() => {}, 99999);
        activeTimers.set('guild-789_channel-456', timerId);

        const interaction = createMockInteraction({ subcommand: 'leave', userId: 'user-123' });
        await execute(interaction);

        expect(session.isActive).toBe(false);
        expect(activeTimers.has('guild-789_channel-456')).toBe(false);
    });

    it('rejects if no active session in channel', async () => {
        mockSession.findOne.mockResolvedValue(null);

        const interaction = createMockInteraction({ subcommand: 'leave' });
        await execute(interaction);

        const replyArg = (interaction.reply as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(replyArg.ephemeral).toBe(true);
    });
});

describe('pomodoro-join button', () => {
    it('adds user to session via button', async () => {
        const session = createMockSession({ id: 42, participants: ['creator-111'] });
        mockSession.findByPk.mockResolvedValue(session);

        const interaction = createMockButtonInteraction('pomodoro-join_42', { userId: 'new-user' });
        await handleButtonInteraction(interaction, interaction.client);

        expect(session.participants).toContain('new-user');
        expect(session.save).toHaveBeenCalled();
    });
});

describe('pomodoro-leave button', () => {
    it('removes user from session via button and updates message', async () => {
        const session = createMockSession({ id: 42, participants: ['user-123', 'user-456'] });
        mockSession.findByPk.mockResolvedValue(session);

        const interaction = createMockButtonInteraction('pomodoro-leave_42', { userId: 'user-123' });
        await handleButtonInteraction(interaction, interaction.client);

        expect(session.participants).not.toContain('user-123');
        expect(interaction.update).toHaveBeenCalled();
    });
});
