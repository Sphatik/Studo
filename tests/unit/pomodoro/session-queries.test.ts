import { describe, it, expect, vi } from 'vitest';
import { PomodoroSession } from '../../../src/database/index.js';
import getActiveChannelPomodoro from '../../../src/commands/pomodoro/pomodoro.js';
import { createMockSession } from '../../mocks/database.js';
import { createMockInteraction } from '../../mocks/discord.js';

const mockPomodoroSession = PomodoroSession as unknown as {
    findOne: ReturnType<typeof vi.fn>;
};

describe('getActiveChannelPomodoro', () => {
    it('returns session when found by channelId', async () => {
        const session = createMockSession();
        mockPomodoroSession.findOne.mockResolvedValueOnce(session);

        const result = await getActiveChannelPomodoro('channel-456', null);
        expect(result).toBe(session);
        expect(mockPomodoroSession.findOne).toHaveBeenCalledWith({
            where: { channelId: 'channel-456', isActive: true },
        });
    });

    it('falls back to voiceChannelId lookup when channelId not found', async () => {
        const session = createMockSession({ voiceChannelId: 'vc-999' });
        mockPomodoroSession.findOne
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(session);

        const result = await getActiveChannelPomodoro('channel-456', 'vc-999');
        expect(result).toBe(session);
    });

    it('returns null when no active session exists', async () => {
        mockPomodoroSession.findOne.mockResolvedValue(null);

        const result = await getActiveChannelPomodoro('channel-456', 'vc-999');
        expect(result).toBeNull();
    });

    it('returns null when voiceChannel is null and channelId has no session', async () => {
        mockPomodoroSession.findOne.mockResolvedValueOnce(null);

        const result = await getActiveChannelPomodoro('channel-456', null);
        expect(result).toBeNull();
        expect(mockPomodoroSession.findOne).toHaveBeenCalledTimes(1);
    });
});
