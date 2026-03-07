import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    SlashCommandSubcommandBuilder,
    ChatInputCommandInteraction,
    Client,
    MessageFlags,
    TextChannel,
    MessageCreateOptions,
    ButtonInteraction,
    Interaction,
    InteractionEditReplyOptions,
    InteractionUpdateOptions,
} from 'discord.js';
import { Op } from 'sequelize';
import { PomodoroCycle, PomodoroSession, ServerConfig } from '../../database/index.js';
import { PomodoroSessionAttributes } from '../../database/models/PomodoroSession.js';
import { speakTTSCached, leaveVC } from '../../utils/voice.js';
import { VoiceChannel } from 'discord.js';

type PomodoroSessionData = PomodoroSessionAttributes;

export interface IPomodoroSpeaker {
    playStart: (session: PomodoroSession | PomodoroSessionAttributes) => void;
    playComplete: (session: PomodoroSession | PomodoroSessionAttributes) => void;
    playSkipToBreak: (session: PomodoroSession | PomodoroSessionAttributes) => void;
    playBreakComplete: (session: PomodoroSession | PomodoroSessionAttributes) => void;
}

/** @internal exposed for testing */
export const activeTimers = new Map<string, NodeJS.Timeout>();
/** @internal exposed for testing */
export const breakTimers = new Map<string, NodeJS.Timeout>();

function makeSpeaker(client: Client): IPomodoroSpeaker {
    async function speak(session: PomodoroSession | PomodoroSessionAttributes, text: string) {
        if (!session.voiceChannelId) return;
        try {
            console.debug("Saying: " + text);
            const ch = await client.channels.fetch(session.voiceChannelId);
            if (ch instanceof VoiceChannel) await speakTTSCached(ch, text);
        } catch (err) {
            console.error('[TTS] speakTTS error:', err);
        }
    }
    return {
        playStart: (s) => { speak(s, 'Pomodoro started. Focus up!'); },
        playComplete: (s) => { speak(s, 'Pomodoro complete. Time for a break!'); },
        playSkipToBreak: (s) => { speak(s, 'Skipping to break.'); },
        playBreakComplete: (s) => { speak(s, 'Break over. Ready for another pomodoro?'); },
    };
}

export function setPomodoroSpeaker(s: IPomodoroSpeaker) { pomodoroSpeaker = s; }

var pomodoroSpeaker: IPomodoroSpeaker = {
    playStart() { console.log("NOT IMPL"); },
    playComplete() { console.log('complete'); },
    playSkipToBreak() { console.log("skipping to break"); },
    playBreakComplete() { console.log("break complete"); },
};

export function initPomodoroSpeaker(client: Client) {
    pomodoroSpeaker = makeSpeaker(client);
}


// #region Commands

const startPomodoroSubcommand = new SlashCommandSubcommandBuilder()
    .setName('start')
    .setDescription('Start a pomodoro timer')
    .addIntegerOption(option =>
        option
            .setName('duration')
            .setDescription('Duration in minutes (default: 25)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(120)
    )
    .addIntegerOption(option =>
        option
            .setName('break')
            .setDescription('Break duration in minutes (default: 5)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(30)
    )
    .addChannelOption(option =>
        option
            .setName('voice')
            .setDescription('Voice channel to join for audio notifications')
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildVoice)
    );
const joinPomodoroSubcommand = new SlashCommandSubcommandBuilder()
    .setName('join')
    .setDescription('Join the active pomodoro timer in this channel');
const leavePomodoroSubcommand = new SlashCommandSubcommandBuilder()
    .setName('leave')
    .setDescription('Leave the active pomodoro timer');
const stopPomodoroSubcommand = new SlashCommandSubcommandBuilder()
    .setName('stop')
    .setDescription('Stop the active pomodoro timer');
const statusPomodoroSubcommand = new SlashCommandSubcommandBuilder()
    .setName('status')
    .setDescription('Check the status of the active pomodoro timer');
const leaderboardPomodoroSubcommand = new SlashCommandSubcommandBuilder()
    .setName('leaderboard')
    .setDescription('View the pomodoro leaderboard')
    .addStringOption(option =>
        option
            .setName('timeframe')
            .setDescription('Leaderboard timeframe (default: all-time)')
            .setRequired(false)
            .addChoices(
                { name: 'All Time', value: 'alltime' },
                { name: 'Today', value: 'daily' }
            )
    );
const setChannelSubcommand = new SlashCommandSubcommandBuilder()
    .setName('set-channel')
    .setDescription('(Admin) Set the default text channel for pomodoro sessions')
    .addChannelOption(option =>
        option
            .setName('channel')
            .setDescription('Text channel to use for pomodoro sessions')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
    );
const panelSubcommand = new SlashCommandSubcommandBuilder()
    .setName('panel')
    .setDescription('(Admin) Post the pomodoro preset panel in this channel');

export const data = new SlashCommandBuilder()
    .setName('pomodoro')
    .setDescription("Pomodoro timer for focused study sessions")
    .addSubcommand(startPomodoroSubcommand)
    .addSubcommand(stopPomodoroSubcommand)
    .addSubcommand(joinPomodoroSubcommand)
    .addSubcommand(leavePomodoroSubcommand)
    .addSubcommand(leaderboardPomodoroSubcommand)
    .addSubcommand(statusPomodoroSubcommand)
    .addSubcommand(setChannelSubcommand)
    .addSubcommand(panelSubcommand);

// #endregion Commands

// #region Interactions
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    switch (subcommand) {
        case 'start':
            await handleStartCmd(interaction);
            break;
        case 'join':
            await handleJoinCmd(interaction);
            break;
        case 'leave':
            await handleLeaveCmd(interaction);
            break;
        case 'status':
            await handleStatus(interaction);
            break;
        case 'stop':
            await handleStop(interaction);
            break;
        case 'leaderboard':
            await handleLeaderboard(interaction);
            break;
        case 'set-channel':
            await handleSetChannel(interaction);
            break;
        case 'panel':
            await handlePanel(interaction);
            break;
    }
}

export async function handleButtonInteraction(interaction: ButtonInteraction, client: Client) {
    if (!interaction.isButton()) return false;
    const parts = interaction.customId.split('_');
    const action = parts[0];
    const sessionId = parts[1];
    const session = await PomodoroSession.findByPk(parseInt(sessionId));

    // Only want pomodoro buttons
    if (!action.includes('pomodoro')) return;

    // Preset buttons — no session needed
    if (action === 'pomodoro-preset') {
        const duration = parseInt(parts[1]);
        const breakDuration = parseInt(parts[2]);
        return await btnPomoPreset(interaction, client, duration, breakDuration);
    }

    // Actions that dont require sessions
    if (action === 'pomodoro-end') {
        return await btnPomoEnd(interaction, session);
    }
    // -----

    // Actiosn requiring sessions
    if (!session) {
        await interaction.reply({
            content: 'This pomodoro session is no longer active or not found',
            ephemeral: true,
        });
        return false;
    }
    if (action === 'pomodoro-join') {
        await btnPomoJoin(interaction, session);
    }

    if (action === 'pomodoro-leave') {
        await btnPomoLeave(interaction, session);
    }

    if (action === 'pomodoro-skiptobreak') {
        await btnPomoSkipToBreak(interaction, session);
    }

    if (action === 'pomodoro-break') {
        await btnPomoBreakstart(interaction, session);
    }

    if (action === 'pomodoro-skipbreak') {
        await btnPomoSkipBreak(interaction, session);
    }

    if (action === 'pomodoro-repeat') {
        await btnPomoRepeat(interaction, session);
    }
    return true;
}

// #endregion Interactions

// #region Command Impl
async function handleStartCmd(interaction: ChatInputCommandInteraction): Promise<void> {
    const duration = interaction.options.getInteger('duration') || 25;
    const breakDuration = interaction.options.getInteger('break') || 5;
    const voiceChannel = interaction.options.getChannel('voice');
    let voiceChannelId = voiceChannel ? voiceChannel.id : null;

    // Auto-join the voice channel the user is currently in (if no voice channel specified)
    if (!voiceChannelId) {
        const member = await interaction.guild?.members.fetch(interaction.user.id);
        const userVoiceChannelId = member?.voice.channelId ?? null;
        if (userVoiceChannelId) voiceChannelId = userVoiceChannelId;
    }

    const channelId = interaction.channel!.id;
    const guildId = interaction.guild!.id;

    if (await checkExistsSession(interaction, channelId, voiceChannelId))
        return;

    const now = new Date();
    const endsAt = new Date(now.getTime() + duration * 60 * 1000);
    const session = await PomodoroSession.create({
        guildId,
        channelId,
        creatorId: interaction.user.id,
        participants: [interaction.user.id],
        duration,
        breakDuration,
        startedAt: now,
        endsAt: endsAt,
        isActive: true,
        voiceChannelId,
    }) as unknown as PomodoroSessionData;
    scheduleTimer(session, interaction.client);

    if (voiceChannelId)
        pomodoroSpeaker.playStart(session);
    await interaction.reply(embedTimerStatus(session, "Pomodoro Timer Started!", true));
}

async function handleJoinCmd(interaction: ChatInputCommandInteraction): Promise<void> {
    // -- CHECKS --
    if (interaction == null) return;
    const channelId = interaction.channel?.id;
    if (channelId == null) {
        await interaction.reply({
            content: "Unexpected error, channel is null.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    const session = await PomodoroSession.findOne({
        where: {
            channelId,
            isActive: true,
        },
    });
    await handleJoin(session, interaction);
}

async function handleLeaveCmd(interaction: ChatInputCommandInteraction): Promise<void> {
    const channelId = interaction.channel?.id;
    if (channelId == null) return;

    const session = await PomodoroSession.findOne({
        where: {
            channelId,
            isActive: true,
        },
    });
    if (!session) {
        await interaction.reply({
            content: 'No active pomodoro timer in this channel.',
            ephemeral: true,
        });
        return;
    }
    await handleLeave(session, interaction);
}

async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
    const channelId = interaction.channel?.id;
    if (channelId == null) return;

    var session = await PomodoroSession.findOne({
        where: {
            channelId,
            isActive: true,
        },
    });

    // Try to find in VC
    if (!session) {
        const member = await interaction.guild?.members.fetch(interaction.user.id);
        if (member) {
            const userVoiceChannelId = member.voice.channelId;
            if (userVoiceChannelId != null) {
                session = await PomodoroSession.findOne({
                    where: {
                        voiceChannelId: userVoiceChannelId,
                        isActive: true,
                    },
                });
            }
        }
    }
    if (!session) {
        await interaction.reply({
            content:
                'No active pomodoro timer in this channel. Start one with `/pomodoro start`!',
            ephemeral: true,
        });
        return;
    }
    const embed = embedTimerStatus(session, "Pomodoro Timer Status", false);
    await interaction.reply(embed);
}

async function handleStop(interaction: ChatInputCommandInteraction): Promise<void> {
    const channelId = interaction.channel?.id;
    if (channelId == null) return;
    const session = await PomodoroSession.findOne({
        where: {
            channelId,
            isActive: true,
        },
    });

    if (!session) {
        await interaction.reply({
            content: 'No active pomodoro timer in this channel.',
            ephemeral: true,
        });
        return;
    }

    // Only creator can stop the timer
    if (session.creatorId !== interaction.user.id) {
        await interaction.reply({
            content: 'Only the person who started the pomodoro can stop it.',
            ephemeral: true,
        });
        return;
    }

    // Clear the scheduled timer
    const timerKey = `${session.guildId}_${channelId}`;
    const timerId = activeTimers.get(timerKey);
    if (timerId) {
        clearTimeout(timerId);
        activeTimers.delete(timerKey);
    }

    session.isActive = false;
    await session.save();

    const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle('Pomodoro Timer Stopped')
        .setDescription(`The pomodoro session has been stopped by ${interaction.user}.`)
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleLeaderboard(interaction: ChatInputCommandInteraction): Promise<void> {
    const timeframe = interaction.options.getString('timeframe') || 'alltime';
    const guildId = interaction.guild!.id;

    const whereClause: Record<string, unknown> = { guildId };
    if (timeframe === 'daily') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        whereClause.createdAt = { [Op.gte]: today };
    }

    const cycles = await PomodoroCycle.findAll({
        where: whereClause,
        attributes: [
            'userDiscordId',
            [PomodoroCycle.sequelize!.fn('COUNT', PomodoroCycle.sequelize!.col('id')), 'cycleCount'],
            [PomodoroCycle.sequelize!.fn('SUM', PomodoroCycle.sequelize!.col('duration')), 'totalMinutes'],
        ],
        group: ['userDiscordId'],
        order: [[PomodoroCycle.sequelize!.literal('cycleCount'), 'DESC']],
        limit: 10,
        raw: true,
    }) as unknown as { userDiscordId: string; cycleCount: number; totalMinutes: number }[];

    if (cycles.length === 0) {
        await interaction.reply({
            content: timeframe === 'daily'
                ? 'No pomodoro cycles completed today yet. Start one with `/pomodoro start`!'
                : 'No pomodoro cycles completed yet. Start one with `/pomodoro start`!',
            ephemeral: true,
        });
        return;
    }

    const entries = cycles.map((row, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        const hours = Math.floor(row.totalMinutes / 60);
        const mins = row.totalMinutes % 60;
        const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        return `${medal} <@${row.userDiscordId}> — **${row.cycleCount}** cycles (${timeStr})`;
    });

    const title = timeframe === 'daily'
        ? `${interaction.guild!.name} — Today's Pomodoro Leaderboard`
        : `${interaction.guild!.name} — All-Time Pomodoro Leaderboard`;

    const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(title)
        .setDescription(entries.join('\n'))
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleSetChannel(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.memberPermissions?.has('ManageGuild')) {
        await interaction.reply({ content: 'You need the **Manage Server** permission to use this command.', ephemeral: true });
        return;
    }
    const channel = interaction.options.getChannel('channel', true);
    const guildId = interaction.guild!.id;
    await ServerConfig.upsert({ guildId, pomodoroChannelId: channel.id } as any);
    await interaction.reply({ content: `Pomodoro default channel set to <#${channel.id}>.`, ephemeral: true });
}

async function handlePanel(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.memberPermissions?.has('ManageGuild')) {
        await interaction.reply({ content: 'You need the **Manage Server** permission to use this command.', ephemeral: true });
        return;
    }
    const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle('Start a Pomodoro Session')
        .setDescription('Pick a preset to start a pomodoro. The bot will join your current voice channel.\n\n**25/5** — Classic pomodoro\n**50/10** — Long focus\n**55/5** — Extended focus');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('pomodoro-preset_25_5').setLabel('25 / 5').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('pomodoro-preset_50_10').setLabel('50 / 10').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('pomodoro-preset_55_5').setLabel('55 / 5').setStyle(ButtonStyle.Primary),
    );

    await interaction.reply({ embeds: [embed], components: [row] });
}
// #endregion Command Impl

// #region Button Impl

async function btnPomoPreset(interaction: ButtonInteraction, client: Client, duration: number, breakDuration: number) {
    const guildId = interaction.guildId!;

    // Look up the configured pomodoro channel for this server
    const config = await ServerConfig.findByPk(guildId);
    const channelId = config?.pomodoroChannelId;
    if (!channelId) {
        await interaction.reply({
            content: 'No pomodoro channel configured. An admin must run `/pomodoro set-channel` first.',
            ephemeral: true,
        });
        return false;
    }

    // Check if there's already an active session in that channel
    if (await getActiveChannelPomodoro(channelId, null)) {
        await interaction.reply({
            content: `There is already an active pomodoro session in <#${channelId}>!`,
            ephemeral: true,
        });
        return false;
    }

    // Auto-detect the user's current voice channel
    const member = await interaction.guild?.members.fetch(interaction.user.id);
    const voiceChannelId = member?.voice.channelId ?? null;

    const now = new Date();
    const endsAt = new Date(now.getTime() + duration * 60 * 1000);
    const session = await PomodoroSession.create({
        guildId,
        channelId,
        creatorId: interaction.user.id,
        participants: [interaction.user.id],
        duration,
        breakDuration,
        startedAt: now,
        endsAt,
        isActive: true,
        voiceChannelId,
    });
    scheduleTimer(session, client);
    if (voiceChannelId) pomodoroSpeaker.playStart(session);

    const embed = embedTimerStatus(session, 'Pomodoro Timer Started!', true);
    // Post in the configured pomodoro channel
    const channel = await client.channels.fetch(channelId) as TextChannel;
    await channel.send(embed);

    await interaction.reply({ content: `Pomodoro started in <#${channelId}>!`, ephemeral: true });
    return true;
}

async function btnPomoJoin(interaction: ButtonInteraction, session: PomodoroSession) {
    if (!session.isActive) {
        await interaction.reply({
            content: 'This pomodoro session is no longer active.',
            ephemeral: true,
        });
        return true;
    }
    await handleJoin(session, interaction);
    return true;
}

async function btnPomoLeave(interaction: ButtonInteraction, session: PomodoroSession) {
    await handleLeave(session, interaction);
    return true;
}

async function btnPomoSkipToBreak(interaction: ButtonInteraction, session: PomodoroSession) {
    const onlyUser = session.participants.length === 1 && session.participants[0] === interaction.user.id;
    if (!onlyUser && session.creatorId !== interaction.user.id) {
        await interaction.reply({
            content: 'Only the session creator can skip to break.',
            ephemeral: true,
        });
        return;
    }
    await skipToBreak(session, interaction);

}

async function btnPomoRepeat(interaction: ButtonInteraction, session: PomodoroSession) {
    await repeatPomoSession(session, interaction);
    return true;
}

async function btnPomoEnd(interaction: ButtonInteraction, session: PomodoroSession | null) {
    // If there's an active session with other participants, only the creator can end it
    if (session?.isActive) {
        const onlyUser = session.participants.length === 1 && session.participants[0] === interaction.user.id;
        if (!onlyUser && session.creatorId !== interaction.user.id) {
            await interaction.reply({
                content: 'Only the session creator can end the pomodoro.',
                ephemeral: true,
            });
            return false;
        }
    }

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('Pomodoro Complete!')
        .setDescription('Session ended. Great job on your focused work!')
        .setTimestamp();

    await interaction.update({ embeds: [embed], components: [] });

    if (session) {
        const timerKey = `${session.guildId}_${session.channelId}`;
        const timerId = activeTimers.get(timerKey);
        if (timerId) {
            clearTimeout(timerId);
            activeTimers.delete(timerKey);
        }
        const breakKey = `break_${session.guildId}_${session.channelId}`;
        const breakId = breakTimers.get(breakKey);
        if (breakId) {
            clearTimeout(breakId);
            breakTimers.delete(breakKey);
        }
        session.isActive = false;
        await session.save();
    }

    if (interaction.guildId) leaveVC(interaction.guildId);
    return true;
}

async function btnPomoBreakstart(interaction: ButtonInteraction, session: PomodoroSession) {
    // Check if there's already an active break in this channel
    const breakKey = `break_${session.guildId}_${session.channelId}`;
    if (breakTimers.has(breakKey)) {
        await interaction.reply({
            content: 'A break timer is already running!',
            ephemeral: true,
        });
        return true;
    }
    const embed = embedBreakActive(session);
    await interaction.update(embed as InteractionUpdateOptions);

    const breakDuration = session.breakDuration * 60 * 1000;
    const timerId = setTimeout(() => {
        breakTimers.delete(breakKey);
        completeBreak(session, interaction.client);
    }, breakDuration);
    breakTimers.set(breakKey, timerId);

    return true;
}

async function btnPomoSkipBreak(interaction: ButtonInteraction, session: PomodoroSession) {
    // Cancel the break timer
    const breakKey = `break_${session.guildId}_${session.channelId}`;
    const breakData = breakTimers.get(breakKey);
    if (breakData) {
        clearTimeout(breakData);
        breakTimers.delete(breakKey);
    }
    const timerKey = `${session.guildId}_${session.channelId}`;
    if (activeTimers.has(timerKey)) {
        await interaction.reply({ content: 'There is already an active pomodoro timer in this channel!', ephemeral: true });
        return true;
    }
    const now = new Date();
    const endsAt = new Date(now.getTime() + session.duration * 60 * 1000);
    const newSession = await PomodoroSession.create({
        guildId: session.guildId,
        channelId: session.channelId,
        creatorId: interaction.user.id,
        participants: session.participants,
        duration: session.duration,
        breakDuration: session.breakDuration,
        startedAt: now,
        endsAt: endsAt,
        isActive: true,
        voiceChannelId: session.voiceChannelId,
    });
    scheduleTimer(newSession, interaction.client);
    if (session.voiceChannelId) {
        pomodoroSpeaker.playStart(session);
    }
    const embed = embedTimerStatus(newSession, "Pomodoro Timer Started!", true);
    await interaction.update(embed);
    return true;
}

// #endregion

// #region Logic Impl

async function handleJoin(session: PomodoroSession | null, interaction: ChatInputCommandInteraction | ButtonInteraction) {
    if (!session || !session.isActive) {
        await interaction.reply({
            content:
                'No active pomodoro timer in this channel. Start one with `/pomodoro start`!',
            ephemeral: true,
        });
        return;
    }
    const participants = session.participants;
    if (participants.includes(interaction.user.id)) {
        await interaction.reply({
            content: "You've already joined this pomodoro session!",
            ephemeral: true,
        });
        return;
    }
    // -- END CHECKS --

    // Check if user is in the required voice channel
    if (session.voiceChannelId != null) {
        const member = await interaction.guild?.members.fetch(interaction.user.id);
        if (member) {
            const userVoiceChannelId = member.voice.channelId;

            if (userVoiceChannelId !== session.voiceChannelId) {
                await interaction.reply({
                    content: `You must be in <#${session.voiceChannelId}> to join this pomodoro session!`,
                    ephemeral: true,
                });
                return;
            }
        }
    }

    participants.push(interaction.user.id);
    session.participants = participants;
    await session.save();

    const embed = embedUserJoined(session, interaction.user.displayName);
    if (interaction.isButton()) {
        await interaction.update({ embeds: [embed], components: [] });
    } else {
        await interaction.reply({ embeds: [embed] });
    }
}

async function handleLeave(session: PomodoroSession | null, interaction: ChatInputCommandInteraction | ButtonInteraction) {
    if (!session) {
        await interaction.reply({
            content: 'Session not found, maybe it has expired.',
            ephemeral: true,
        });
        return;
    }
    const participants = session.participants;
    if (!participants.includes(interaction.user.id)) {
        await interaction.reply({
            content: "You're not part of this pomodoro session.",
            ephemeral: true,
        });
        return;
    }
    const updatedParticipants = participants.filter(id => id !== interaction.user.id);
    session.participants = updatedParticipants;
    await session.save();

    // If no participants left, end the session
    if (updatedParticipants.length === 0) {
        const timerKey = `${session.guildId}_${session.channelId}`;
        const timerId = activeTimers.get(timerKey);
        if (timerId) {
            clearTimeout(timerId);
            activeTimers.delete(timerKey);
        }
        session.isActive = false;
        await session.save();

        const embed = new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle('Pomodoro Ended')
            .setDescription('All participants have left. The pomodoro session has been ended.')
            .setTimestamp();

        if (interaction.isButton()) {
            await interaction.update({ embeds: [embed], components: [] });
        } else {
            await interaction.reply({ embeds: [embed] });
        }
        return;
    }

    // Update the embed with the new participant list
    const updatedEmbed = embedTimerStatus(session, "Pomodoro Timer", true);
    if (interaction.isButton()) {
        await interaction.update(updatedEmbed);
    } else {
        await interaction.reply({ content: "You've left the pomodoro session.", ephemeral: true });
    }
}

/**
 * No cycle will be logged when skipping. 
 */
async function skipToBreak(session: PomodoroSession, interaction: ButtonInteraction) {
    await interaction.deferUpdate();
    // Clear the scheduled timer
    const timerKey = `${session.guildId}_${session.channelId}`;
    const timerId = activeTimers.get(timerKey);
    if (timerId) {
        clearTimeout(timerId);
        activeTimers.delete(timerKey);
    }
    session.isActive = false;
    await session.save();

    if (session.voiceChannelId) {
        try {
            pomodoroSpeaker.playSkipToBreak(session);
        } catch (err) {
            console.error('TTS error:', err);
        }
    }
    const result = embedCompleteStartBreak(session, "Pomodoro Skipped!");
    await interaction.editReply(result as InteractionEditReplyOptions);
    return true;
}

async function repeatPomoSession(session: PomodoroSession, interaction: ButtonInteraction) {
    // Cancel any existing break timer for this channel
    const breakKey = `break_${session.guildId}_${session.channelId}`;
    const breakId = breakTimers.get(breakKey);
    if (breakId) {
        clearTimeout(breakId);
        breakTimers.delete(breakKey);
    }
    const timerKey = `${session.guildId}_${session.channelId}`;
    if (activeTimers.has(timerKey)) {
        await interaction.reply({ content: 'There is already an active pomodoro timer in this channel!', ephemeral: true });
        return true;
    }
    // Start a new session with the same duration and participants
    const now = new Date();
    const endsAt = new Date(now.getTime() + session.duration * 60 * 1000);

    const newSession = await PomodoroSession.create({
        guildId: session.guildId,
        channelId: session.channelId,
        creatorId: interaction.user.id,
        participants: session.participants,
        duration: session.duration,
        breakDuration: session.breakDuration,
        startedAt: now,
        endsAt: endsAt,
        isActive: true,
        voiceChannelId: session.voiceChannelId,
    });

    scheduleTimer(newSession, interaction.client);

    pomodoroSpeaker.playStart(newSession);

    const embed = embedTimerStatus(newSession, "Pomodoro Timer Started!", true);
    await interaction.update(embed);

    return true;
}

// #endregion

// #region Timers
export function scheduleTimer(session: PomodoroSessionData, client: Client): void {
    const timerKey = `${session.guildId}_${session.channelId}`;
    const timeUntilEnd = new Date(session.endsAt).getTime() - new Date().getTime();
    if (timeUntilEnd <= 0) {
        completeTimer(session, client);
        return;
    }
    const timerId = setTimeout(() => {
        completeTimer(session, client);
    }, timeUntilEnd);
    activeTimers.set(timerKey, timerId);
}

export async function completeTimer(session: PomodoroSessionData, client: Client): Promise<void> {
    const timerKey = `${session.guildId}_${session.channelId}`;
    activeTimers.delete(timerKey);

    // Refresh session from database in case participants changed
    const currentSession = await PomodoroSession.findByPk(session.id);
    if (!currentSession || !currentSession.isActive) {
        return; // Session was stopped or doesn't exist
    }

    currentSession.isActive = false;
    await currentSession.save();

    // Log a completed cycle for each participant
    const participants = currentSession.participants;
    if (participants.length > 0) {
        await PomodoroCycle.bulkCreate(
            participants.map(userId => ({
                userDiscordId: userId,
                guildId: currentSession.guildId,
                duration: currentSession.duration,
                sessionId: currentSession.id,
            }))
        );
    }
    pomodoroSpeaker.playComplete(currentSession);
    try {
        const channel = await client.channels.fetch(currentSession.channelId);
        if (!channel) return;
        const embed = embedCompleteStartBreak(currentSession);
        (channel as TextChannel).send(embed);
    } catch (e) {
        console.error("Failed sending break-complete msg", e);
    }
}

export async function completeBreak(session: PomodoroSessionData, client: Client) {
    try {
        const channel = await client.channels.fetch(session.channelId) as TextChannel;
        if (!channel) return;
        // Check if there's already an active timer
        const existingSession = await PomodoroSession.findOne({
            where: {
                channelId: session.channelId,
                isActive: true,
            },
        });

        if (existingSession) {
            return; // Don't send break end message if a new pomodoro is already running
        }
        if (session.voiceChannelId) {
            pomodoroSpeaker.playBreakComplete(session);
        }
        const embed = embedBreakOver(session);

        await channel.send(embed);
    } catch (e) {
        console.error('Failed to send break completion message:', e);
    }
}

// #endregion

// #region Embeds

export function embedTimerStatus(session: PomodoroSessionData, title: String, hasButtons: boolean = false) {
    const endsAtTimestamp = Math.floor(session.endsAt.getTime() / 1000);
    const participantMentions = session.participants.map(id => `<@${id}>`).join(', ');

    const fields = [
        { name: 'Duration', value: `${session.duration} minutes`, inline: true },
        { name: 'Break', value: `${session.breakDuration} minutes`, inline: true },
        { name: 'Ends At', value: `<t:${endsAtTimestamp}:T>`, inline: true },
        { name: 'Participants', value: `${participantMentions}` },
    ];
    if (session.voiceChannelId) {
        fields.push({ name: 'Voice Channel', value: `<#${session.voiceChannelId}>`, inline: true });
    }

    const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(title as string)
        .setDescription(
            `A ${session.duration} minute pomodoro session has started. Click **Join** to participate!\nEnds <t:${endsAtTimestamp}:R>`
        )
        .addFields(fields)
        .setFooter({ text: `Started by user ${session.creatorId}` })
        .setTimestamp();
    if (!hasButtons) return { embeds: [embed], components: [] };
    const btns = _createStartTimerButtons(session);
    return { embeds: [embed], components: [btns] };
}
export function embedUserJoined(session: PomodoroSession, user: string) {
    const participants = session.participants;
    const endsAtTimestamp = Math.floor(new Date(session.endsAt).getTime() / 1000);
    const participantMentions = participants.map(id => `<@${id}>`).join(', ');
    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('Joined Pomodoro Session!')
        .setDescription(`${user} has joined the pomodoro session!\nEnds <t:${endsAtTimestamp}:R>`)
        .addFields(
            { name: 'Participants', value: participantMentions }
        )
        .setTimestamp();
    return embed;
}

export function embedCompleteStartBreak(session: PomodoroSessionAttributes, title: string = "Pomodoro Complete!"): MessageCreateOptions {
    const participantMentions = session.participants.map(id => `<@${id}>`).join(' ');
    const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle(title)
        .setDescription(
            `Great work! Your ${session.duration} minute pomodoro session is complete. Time for a ${session.breakDuration} minute break!`
        )
        .addFields({
            name: 'Participants',
            value: session.participants.map(id => `<@${id}>`).join(', ') || 'None',
        })
        .setTimestamp();
    const row = _createCompleteStartBreakButtons(session);
    return { content: participantMentions, embeds: [embed], components: [row] };
}

export function embedBreakActive(session: PomodoroSession) {
    const breakDuration = session.breakDuration || 5;
    const endsAt = new Date(Date.now() + breakDuration * 60 * 1000);
    const endsAtTimestamp = Math.floor(endsAt.getTime() / 1000);

    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('Break Time!')
        .setDescription(`Taking a ${session.breakDuration} minute break. You'll be pinged when it's time to start another pomodoro!\nEnds <t:${endsAtTimestamp}:R>`)
        .addFields(
            { name: 'Participants', value: session.participants.map(id => `<@${id}>`).join(', ') || 'None' }
        )
        .setTimestamp();

    const skipBreakButton = new ButtonBuilder()
        .setCustomId(`pomodoro-skipbreak_${session.id}`)
        .setLabel('Skip Break')
        .setStyle(ButtonStyle.Secondary);

    const endButton = new ButtonBuilder()
        .setCustomId(`pomodoro-end_${session.id}`)
        .setLabel('End')
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(skipBreakButton, endButton);
    return { embeds: [embed], components: [row] };
}

export function embedBreakOver(session: PomodoroSessionData) {
    const participantMentions = session.participants.map(id => `<@${id}>`).join(' ');
    const embed = new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle('Break Over!')
        .setDescription(`Your ${session.breakDuration} minute break is complete. Ready for another pomodoro?`)
        .addFields({
            name: 'Participants',
            value: session.participants.map(id => `<@${id}>`).join(', ') || 'None',
        })
        .setTimestamp();

    const startButton = new ButtonBuilder()
        .setCustomId(`pomodoro-repeat_${session.id}`)
        .setLabel('Start Pomodoro')
        .setStyle(ButtonStyle.Success);

    const dismissButton = new ButtonBuilder()
        .setCustomId(`pomodoro-end_${session.id}`)
        .setLabel('Dismiss')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(startButton, dismissButton);
    return {
        content: participantMentions,
        embeds: [embed],
        components: [row],
    }
}

export function _createStartTimerButtons(session: PomodoroSessionData) {
    const sessionId = session.id;
    const joinButton = new ButtonBuilder()
        .setCustomId(`pomodoro-join_${sessionId}`)
        .setLabel('Join')
        .setStyle(ButtonStyle.Success);

    const leaveButton = new ButtonBuilder()
        .setCustomId(`pomodoro-leave_${sessionId}`)
        .setLabel('Leave')
        .setStyle(ButtonStyle.Danger);

    const skipToBreakButton = new ButtonBuilder()
        .setCustomId(`pomodoro-skiptobreak_${sessionId}`)
        .setLabel('Skip to Break')
        .setStyle(ButtonStyle.Secondary);

    const endButton = new ButtonBuilder()
        .setCustomId(`pomodoro-end_${sessionId}`)
        .setLabel('End')
        .setStyle(ButtonStyle.Danger);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(joinButton, leaveButton, skipToBreakButton, endButton);
}

export function _createCompleteStartBreakButtons(session: PomodoroSessionData) {
    const breakButton = new ButtonBuilder()
        .setCustomId(`pomodoro-break_${session.id}`)
        .setLabel(`Start ${session.breakDuration}min Break`)
        .setStyle(ButtonStyle.Primary);

    const repeatButton = new ButtonBuilder()
        .setCustomId(`pomodoro-repeat_${session.id}`)
        .setLabel('Skip Break & Start Another')
        .setStyle(ButtonStyle.Success);

    const dismissButton = new ButtonBuilder()
        .setCustomId(`pomodoro-end_${session.id}`)
        .setLabel('End')
        .setStyle(ButtonStyle.Secondary);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(breakButton, repeatButton, dismissButton);
    return row;
}

// #endregion

// #region Startup

export async function restoreTimers(client: Client): Promise<void> {
    const activeSessions = await PomodoroSession.findAll({
        where: { isActive: true },
    });

    for (const session of activeSessions) {
        const now = new Date();
        const endsAt = new Date(session.endsAt);

        if (endsAt <= now) {
            await completeTimer(session, client);
        } else {
            scheduleTimer(session, client);
        }
    }

    console.log(`Restored ${activeSessions.length} active pomodoro timer(s)`);
}

// #endregion

// #region Util

/**
 * Check if theres a active timer in channel
 */
async function checkExistsSession(interaction: ChatInputCommandInteraction | ButtonInteraction,
    channelId: string, voiceChannelId: string | null = null) {
    const existingSession = await getActiveChannelPomodoro(channelId, voiceChannelId);
    if (existingSession) {
        await interaction.reply({
            content: 'There is already an active pomodoro timer in this channel!',
            ephemeral: true,
        });
        return true;
    }
    return false;
}

export default async function getActiveChannelPomodoro(
    channelId: string,
    voiceChannel: string | null
): Promise<PomodoroSession | null> {
    const existingSession = await PomodoroSession.findOne({
        where: {
            channelId,
            isActive: true,
        }
    });
    if (existingSession) return existingSession;
    if (voiceChannel == null) return null;
    const voiceSession = await PomodoroSession.findOne({
        where: {
            voiceChannelId: voiceChannel,
            isActive: true
        }
    });
    if (voiceSession) return voiceSession;
    return null;
}


// #endregion