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
import { PomodoroCycle, PomodoroSession } from '../../database/index.js';
import { PomodoroSessionAttributes } from '../../database/models/PomodoroSession.js';
import { leaveVC } from '../../utils/voice.js';
import { channel } from 'node:diagnostics_channel';

type PomodoroSessionData = PomodoroSessionAttributes;

export interface IPomodoroSpeaker {
    playStart: (session: PomodoroSession | PomodoroSessionAttributes) => void;
    playComplete: (session: PomodoroSession | PomodoroSessionAttributes) => void;
    playSkipToBreak: (session: PomodoroSession | PomodoroSessionAttributes) => void;
    playBreakComplete: (session: PomodoroSession | PomodoroSessionAttributes) => void;
}

const activeTimers = new Map<string, NodeJS.Timeout>();
const breakTimers = new Map<string, NodeJS.Timeout>();
var pomodoroSpeaker: IPomodoroSpeaker = {
    playStart() {
        console.log("NOT IMPL");
    },
    playComplete() {
        console.log('complete');
    },
    playSkipToBreak() {
        console.log("skipping to break");
    },
    playBreakComplete() {
    }
};


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

export const data = new SlashCommandBuilder()
    .setName('pomodoro2')
    .setDescription("Pomodoro timer for focused study sessions")
    .addSubcommand(startPomodoroSubcommand)
    .addSubcommand(stopPomodoroSubcommand)
    .addSubcommand(joinPomodoroSubcommand)
    .addSubcommand(leavePomodoroSubcommand)
    .addSubcommand(leaderboardPomodoroSubcommand)
    .addSubcommand(statusPomodoroSubcommand);

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
    }
}

export async function handleButtonInteraction(interaction: ButtonInteraction, client: Client) {
    if (!interaction.isButton()) return false;
    const [action, sessionId] = interaction.customId.split('_');
    const session = await PomodoroSession.findByPk(parseInt(sessionId));

    // Only want pomodoro buttons
    if (!action.includes('pomodoro')) return;

    // Actions that dont require sessions
    if (action === 'pomodoro-end') {
        return await btnPomoEnd(interaction);
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
    const voiceChannelId = voiceChannel ? voiceChannel.id : null;
    const channelId = interaction.channel!.id;
    const guildId = interaction.guild!.id;

    if (await checkExistsSession(interaction, channelId, voiceChannelId))
        return;
    const existingSession = await getActiveChannelPomodoro(channelId, voiceChannelId);

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
                        channelId,
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
    // TODO: Implement leaderboard logic
}
// #endregion Command Impl

// #region Button Impl

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
    await skipToBreak(session, interaction);

}

async function btnPomoRepeat(interaction: ButtonInteraction, session: PomodoroSession) {
    await repeatPomoSession(session, interaction);
    return true;
}

async function btnPomoEnd(interaction: ButtonInteraction) {
    const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('Pomodoro Complete!')
        .setDescription('Session ended. Great job on your focused work!')
        .setTimestamp();

    await interaction.update({ embeds: [embed], components: [] });
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
    if (await checkExistsSession(interaction, session.channelId, session.voiceChannelId)) {
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
    const embed = embedTimerStatus(session, "Pomodoro Timer Started!", true);
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
    await interaction.reply({ embeds: [embed] });
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

    await interaction.reply({
        content: "You've left the pomodoro session. You won't be pinged when it ends.",
        ephemeral: true,
    });
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
    // If repeat, then return
    if (await checkExistsSession(interaction, session.channelId, session.voiceChannelId)) {
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

    pomodoroSpeaker.playStart(session);

    const embed = embedTimerStatus(session, "Pomodoro Timer Started!", true);
    await interaction.update(embed);

    return true;
}

// #endregion

// #region Timers
function scheduleTimer(session: PomodoroSessionData, client: Client): void {
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

async function completeTimer(session: PomodoroSessionData, client: Client): Promise<void> {
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
    pomodoroSpeaker.playComplete(session);
    try {
        const channel = await client.channels.fetch(currentSession.channelId);
        if (!channel) return;
        const embed = embedCompleteStartBreak(session);
        (channel as TextChannel).send(embed);
    } catch (e) {
        console.error("Failed sending break-complete msg", e);
    }
}

async function completeBreak(session: PomodoroSessionData, client: Client) {
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

function embedTimerStatus(session: PomodoroSessionData, title: String, hasButtons: boolean = false) {
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
        .setTitle('Pomodoro Timer Started!')
        .setDescription(
            `A ${session.duration} minute pomodoro session has started. Click **Join** to participate!\nEnds <t:${endsAtTimestamp}:R>`
        )
        .addFields(fields)
        .setFooter({ text: `Started by user ${session.creatorId}` })
        .setTimestamp();
    const btns = _createStartTimerButtons(session);
    return { embeds: [embed], components: [btns] };
}
function embedUserJoined(session: PomodoroSession, user: string) {
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

function embedCompleteStartBreak(session: PomodoroSessionAttributes, title: string = "Pomodoro Complete!"): MessageCreateOptions {
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

function embedBreakActive(session: PomodoroSession) {
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
    const row = new ActionRowBuilder().addComponents(skipBreakButton);
    return { embeds: [embed], components: [row] };
}

function embedBreakOver(session: PomodoroSessionData) {
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
        .setCustomId(`pomodoro-dismiss_${session.id}`)
        .setLabel('Dismiss')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(startButton, dismissButton);
    return {
        content: participantMentions,
        embeds: [embed],
        components: [row],
    }
}

function _createStartTimerButtons(session: PomodoroSessionData) {
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

    return new ActionRowBuilder<ButtonBuilder>().addComponents(joinButton, leaveButton, skipToBreakButton);
}

function _createCompleteStartBreakButtons(session: PomodoroSessionData) {
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