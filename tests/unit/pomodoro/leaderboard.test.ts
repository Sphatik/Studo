import { describe, it, expect, vi } from 'vitest';
import { PomodoroCycle } from '../../../src/database/index.js';
import { execute } from '../../../src/commands/pomodoro/pomodoro.js';
import { createMockInteraction } from '../../mocks/discord.js';

const mockPomodoroCycle = PomodoroCycle as unknown as {
    findAll: ReturnType<typeof vi.fn>;
};

function makeLeaderboardInteraction(timeframe: string | null = null) {
    return createMockInteraction({ subcommand: 'leaderboard', timeframe });
}

describe('handleLeaderboard', () => {
    it('replies with no-cycles message when no data', async () => {
        mockPomodoroCycle.findAll.mockResolvedValue([]);
        const interaction = makeLeaderboardInteraction();
        await execute(interaction);
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ ephemeral: true })
        );
    });

    it('formats top 3 with medal emojis', async () => {
        mockPomodoroCycle.findAll.mockResolvedValue([
            { userDiscordId: 'user-1', cycleCount: 10, totalMinutes: 250 },
            { userDiscordId: 'user-2', cycleCount: 8, totalMinutes: 200 },
            { userDiscordId: 'user-3', cycleCount: 5, totalMinutes: 125 },
            { userDiscordId: 'user-4', cycleCount: 3, totalMinutes: 75 },
        ]);
        const interaction = makeLeaderboardInteraction('alltime');
        await execute(interaction);

        const call = (interaction.reply as ReturnType<typeof vi.fn>).mock.calls[0][0];
        const description = call.embeds[0].data.description as string;
        expect(description).toContain('🥇');
        expect(description).toContain('🥈');
        expect(description).toContain('🥉');
        expect(description).toContain('4.');
    });

    it('formats time as minutes when under 60', async () => {
        mockPomodoroCycle.findAll.mockResolvedValue([
            { userDiscordId: 'user-1', cycleCount: 2, totalMinutes: 50 },
        ]);
        const interaction = makeLeaderboardInteraction('alltime');
        await execute(interaction);

        const call = (interaction.reply as ReturnType<typeof vi.fn>).mock.calls[0][0];
        const description = call.embeds[0].data.description as string;
        expect(description).toContain('50m');
    });

    it('formats time as hours and minutes when over 60', async () => {
        mockPomodoroCycle.findAll.mockResolvedValue([
            { userDiscordId: 'user-1', cycleCount: 5, totalMinutes: 90 },
        ]);
        const interaction = makeLeaderboardInteraction('alltime');
        await execute(interaction);

        const call = (interaction.reply as ReturnType<typeof vi.fn>).mock.calls[0][0];
        const description = call.embeds[0].data.description as string;
        expect(description).toContain('1h 30m');
    });

    it('shows daily message when no daily cycles', async () => {
        mockPomodoroCycle.findAll.mockResolvedValue([]);
        const interaction = makeLeaderboardInteraction('daily');
        await execute(interaction);

        const call = (interaction.reply as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(call.content).toContain('today');
    });
});
