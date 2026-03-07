import { vi } from 'vitest';
import type { PomodoroSessionAttributes } from '../../src/database/models/PomodoroSession.js';

export function createMockSession(overrides?: Partial<PomodoroSessionAttributes & { save: () => Promise<void> }>) {
    const now = new Date();
    const endsAt = new Date(now.getTime() + 25 * 60 * 1000);
    return {
        id: 1,
        guildId: 'guild-789',
        channelId: 'channel-456',
        creatorId: 'user-123',
        participants: ['user-123'],
        duration: 25,
        breakDuration: 5,
        startedAt: now,
        endsAt,
        isActive: true,
        voiceChannelId: null,
        save: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}
