import { vi } from 'vitest';
import type {
    ChatInputCommandInteraction,
    ButtonInteraction,
    Client,
    TextChannel,
    Guild,
    GuildMember,
} from 'discord.js';

export function createMockClient(channelSendFn = vi.fn()) {
    return {
        channels: {
            fetch: vi.fn().mockResolvedValue(createMockTextChannel(channelSendFn)),
        },
    } as unknown as Client;
}

export function createMockTextChannel(sendFn = vi.fn()) {
    return {
        id: 'channel-456',
        send: sendFn,
    } as unknown as TextChannel;
}

export function createMockGuildMember(voiceChannelId: string | null = null) {
    return {
        voice: { channelId: voiceChannelId },
    } as unknown as GuildMember;
}

export function createMockGuild(overrides: Partial<{ id: string; name: string; memberVoiceChannelId: string | null }> = {}) {
    const memberVoiceChannelId = overrides.memberVoiceChannelId ?? null;
    return {
        id: overrides.id ?? 'guild-789',
        name: overrides.name ?? 'Test Guild',
        members: {
            fetch: vi.fn().mockResolvedValue(createMockGuildMember(memberVoiceChannelId)),
        },
        channels: {
            fetch: vi.fn().mockResolvedValue(null),
        },
    } as unknown as Guild;
}

export function createMockInteraction(overrides: {
    subcommand?: string;
    userId?: string;
    channelId?: string;
    guildId?: string;
    guildName?: string;
    duration?: number | null;
    breakDuration?: number | null;
    voiceChannel?: { id: string } | null;
    timeframe?: string | null;
    memberVoiceChannelId?: string | null;
} = {}) {
    const {
        subcommand = 'start',
        userId = 'user-123',
        channelId = 'channel-456',
        guildId = 'guild-789',
        guildName = 'Test Guild',
        duration = null,
        breakDuration = null,
        voiceChannel = null,
        timeframe = null,
        memberVoiceChannelId = null,
    } = overrides;

    const client = createMockClient();

    return {
        user: { id: userId, displayName: 'TestUser' },
        channel: { id: channelId },
        guild: createMockGuild({ id: guildId, name: guildName, memberVoiceChannelId }),
        client,
        options: {
            getSubcommand: vi.fn().mockReturnValue(subcommand),
            getInteger: vi.fn().mockImplementation((name: string) => {
                if (name === 'duration') return duration;
                if (name === 'break') return breakDuration;
                return null;
            }),
            getChannel: vi.fn().mockReturnValue(voiceChannel),
            getString: vi.fn().mockReturnValue(timeframe),
        },
        reply: vi.fn().mockResolvedValue({ fetch: vi.fn().mockResolvedValue({}) }),
        isButton: vi.fn().mockReturnValue(false),
    } as unknown as ChatInputCommandInteraction;
}

export function createMockButtonInteraction(customId: string, overrides: {
    userId?: string;
    memberVoiceChannelId?: string | null;
} = {}) {
    const { userId = 'user-123', memberVoiceChannelId = null } = overrides;
    const client = createMockClient();

    return {
        customId,
        user: { id: userId, displayName: 'TestUser' },
        channel: { id: 'channel-456' },
        guild: createMockGuild({ memberVoiceChannelId }),
        client,
        reply: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
        deferUpdate: vi.fn().mockResolvedValue(undefined),
        editReply: vi.fn().mockResolvedValue(undefined),
        isButton: vi.fn().mockReturnValue(true),
    } as unknown as ButtonInteraction;
}
