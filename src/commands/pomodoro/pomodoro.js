import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    SlashCommandSubcommandBuilder,
} from 'discord.js';
import { Op } from 'sequelize';
import { PomodoroSession, PomodoroCycle } from '../../database/index.js';
import {
    joinVC,
    leaveVC,
    getConnection,
    playPomodoroComplete,
    playBreakComplete,
    playPomodoroStart,
} from '../../utils/voice.js';

import getChannelPomodoro from './pomouti.js'


const activeTimers = new Map();
const breakTimers = new Map();
const pomodoroSpeaker = {};

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
    .setDescription('Stop the active pomodoro timer')
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
    )

export const data = new SlashCommandBuilder()
    .setName('pomodoro2')
    .setDescription("Pomodoro timer for focused study sessions")
    .addSubcommand(startPomodoroSubcommand)
    .addSubcommand(stopPomodoroSubcommand)
    .addSubcommand(joinPomodoroSubcommand)
    .addSubcommand(leavePomodoroSubcommand)
    .addSubcommand(leaderboardPomodoroSubcommand)
    .addSubcommand(statusPomodoroSubcommand)

// #endregion Commands


export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    switch (subcommand) {
        case 'start':
            await handleStart(interaction);
            break;
        case 'join':
            await handleJoin(interaction);
            break;
        case 'leave':
            await handleLeave(interaction);
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

// #region Command Impl
async function handleStart(interaction) {
    const duration = interaction.options.getInteger('duration') || 25;
    const breakDuration = interaction.options.getInteger('break') || 5;
    const voiceChannel = interaction.options.getChannel('voice');
    const voiceChannelId = (voiceChannel) ? voiceChannel.id : null;
    const channelId = interaction.channel.id;
    const guildId = interaction.guild.id;

    const existingSession = getChannelPomodoro(channelId, voiceChannelId);
    if (existingSession) {
        const endsAtTimestamp = Math.floor(new Date(existingSession.endsAt).getTime() / 1000);
        await interaction.reply({
            content: `There's already an active pomodoro timer in this channel ending <t:${endsAtTimestamp}:R>. Use \`/pomodoro join\` to join it!`,
            ephemeral: true,
        });
        return;
    }

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
    });
    scheduleTimer(session, interaction.client);

    if (voiceChannelId)
        pomodoroSpeaker.playStart();
    await interaction.reply(embedTimerStarted());
}



// #endregion Command Impl


// #region Timers
function scheduleTimer(session, client) {
    const timerKey = `${session.guildId}_${session.channelId}`;
    const timeUntilEnd = new Date(session.endsAt) - new Date();
    if (timeUntilEnd <= 0) {
        completeTimer(session, client);
        return;
    }
    const timerId = setTimeout(() => {
        completeTimer(session, client);
    }, timeUntilEnd);
    activeTimers.set(timerKey, timerId);

}
// #endregion

// #region Embeds

function embedTimerStarted(session) {
    const endsAtTimestamp = Math.floor(session.endsAt.getTime() / 1000);
    const participantMentions = session.participants.map(id => `<@${id}>`).join(', ');

    const fields = [
        { name: 'Duration', value: `${session.duration} minutes`, inline: true },
        { name: 'Break', value: `${session.breakDuration} minutes`, inline: true },
        { name: 'Ends At', value: `<t:${endsAtTimestamp}:T>`, inline: true },
        { name: 'Participants', value: `<@${participantMentions}>` },
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
        .setTimestamp();
    const btns = _createStartTimerButtons(session);
    return { embeds: [embed], components: [btns] };
}

function _createStartTimerButtons(session) {
    const sessionId = session.id
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

    return new ActionRowBuilder().addComponents(joinButton, leaveButton, skipToBreakButton);
}

// #endregion