import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} from 'discord.js';
import { Op } from 'sequelize';
import { PomodoroSession, PomodoroCycle } from '../database/index.js';
import {
  joinVC,
  leaveVC,
  getConnection,
  playPomodoroComplete,
  playBreakComplete,
  playPomodoroStart,
} from '../utils/voice.js';

// In-memory storage for active timers (maps channelId to timeout ID)
const activeTimers = new Map();
// In-memory storage for break timers
const breakTimers = new Map();

// Helper to create join/leave buttons for active timers
function createActiveTimerButtons(sessionId) {
  const joinButton = new ButtonBuilder()
    .setCustomId(`pomodoro-join_${sessionId}`)
    .setLabel('Join')
    .setStyle(ButtonStyle.Success);

  const leaveButton = new ButtonBuilder()
    .setCustomId(`pomodoro-leave_${sessionId}`)
    .setLabel('Leave')
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder().addComponents(joinButton, leaveButton);
}

export const data = new SlashCommandBuilder()
  .setName('pomodoro')
  .setDescription('Pomodoro timer for focused study sessions')
  .addSubcommand(subcommand =>
    subcommand
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
      )
  )
  .addSubcommand(subcommand =>
    subcommand.setName('join').setDescription('Join the active pomodoro timer in this channel')
  )
  .addSubcommand(subcommand =>
    subcommand.setName('leave').setDescription('Leave the active pomodoro timer')
  )
  .addSubcommand(subcommand =>
    subcommand.setName('status').setDescription('Check the status of the active pomodoro timer')
  )
  .addSubcommand(subcommand =>
    subcommand.setName('stop').setDescription('Stop the active pomodoro timer')
  )
  .addSubcommand(subcommand =>
    subcommand
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
  )

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

// Handle button interactions for repeat
export async function handleButtonInteraction(interaction, client) {
  if (!interaction.isButton()) return false;

  const [action, sessionId] = interaction.customId.split('_');

  if (action === 'pomodoro-join') {
    const session = await PomodoroSession.findByPk(parseInt(sessionId));
    if (!session || !session.isActive) {
      await interaction.reply({
        content: 'This pomodoro session is no longer active.',
        ephemeral: true,
      });
      return true;
    }

    const participants = session.participants;

    if (participants.includes(interaction.user.id)) {
      await interaction.reply({
        content: "You've already joined this pomodoro session!",
        ephemeral: true,
      });
      return true;
    }

    participants.push(interaction.user.id);
    session.participants = participants;
    await session.save();

    const timeLeft = Math.ceil((new Date(session.endsAt) - new Date()) / 60000);
    const participantMentions = participants.map(id => `<@${id}>`).join(', ');

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('Pomodoro Timer')
      .setDescription(`${interaction.user} joined! A ${session.duration} minute session is in progress.`)
      .addFields(
        { name: 'Duration', value: `${session.duration} minutes`, inline: true },
        { name: 'Time Remaining', value: `${timeLeft} minutes`, inline: true },
        { name: 'Ends At', value: `<t:${Math.floor(new Date(session.endsAt).getTime() / 1000)}:T>`, inline: true },
        { name: 'Participants', value: participantMentions }
      )
      .setTimestamp();

    const row = createActiveTimerButtons(session.id);
    await interaction.update({ embeds: [embed], components: [row] });
    return true;
  }

  if (action === 'pomodoro-leave') {
    const session = await PomodoroSession.findByPk(parseInt(sessionId));
    if (!session || !session.isActive) {
      await interaction.reply({
        content: 'This pomodoro session is no longer active.',
        ephemeral: true,
      });
      return true;
    }

    const participants = session.participants;

    if (!participants.includes(interaction.user.id)) {
      await interaction.reply({
        content: "You're not part of this pomodoro session.",
        ephemeral: true,
      });
      return true;
    }

    const updatedParticipants = participants.filter(id => id !== interaction.user.id);
    session.participants = updatedParticipants;
    await session.save();

    const timeLeft = Math.ceil((new Date(session.endsAt) - new Date()) / 60000);
    const participantMentions = updatedParticipants.map(id => `<@${id}>`).join(', ') || 'None';

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('Pomodoro Timer')
      .setDescription(`${interaction.user} left the session.`)
      .addFields(
        { name: 'Duration', value: `${session.duration} minutes`, inline: true },
        { name: 'Time Remaining', value: `${timeLeft} minutes`, inline: true },
        { name: 'Ends At', value: `<t:${Math.floor(new Date(session.endsAt).getTime() / 1000)}:T>`, inline: true },
        { name: 'Participants', value: participantMentions }
      )
      .setTimestamp();

    const row = createActiveTimerButtons(session.id);
    await interaction.update({ embeds: [embed], components: [row] });
    return true;
  }

  if (action === 'pomodoro-break') {
    const session = await PomodoroSession.findByPk(parseInt(sessionId));
    if (!session) {
      await interaction.reply({
        content: 'Could not find the session.',
        ephemeral: true,
      });
      return true;
    }

    // Check if there's already an active break in this channel
    const breakKey = `break_${session.guildId}_${session.channelId}`;
    if (breakTimers.has(breakKey)) {
      await interaction.reply({
        content: 'A break timer is already running!',
        ephemeral: true,
      });
      return true;
    }

    const breakDuration = session.breakDuration || 5;
    const endsAt = new Date(Date.now() + breakDuration * 60 * 1000);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Break Time!')
      .setDescription(`Taking a ${breakDuration} minute break. You'll be pinged when it's time to start another pomodoro!`)
      .addFields(
        { name: 'Duration', value: `${breakDuration} minutes`, inline: true },
        { name: 'Ends At', value: `<t:${Math.floor(endsAt.getTime() / 1000)}:T>`, inline: true },
        { name: 'Participants', value: session.participants.map(id => `<@${id}>`).join(', ') || 'None' }
      )
      .setTimestamp();

    const skipBreakButton = new ButtonBuilder()
      .setCustomId(`pomodoro-skipbreak_${sessionId}`)
      .setLabel('Skip Break')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(skipBreakButton);

    await interaction.update({ embeds: [embed], components: [row] });

    // Schedule break completion
    const timerId = setTimeout(async () => {
      breakTimers.delete(breakKey);
      await completeBreak(session, client);
    }, breakDuration * 60 * 1000);

    breakTimers.set(breakKey, { timerId, sessionId: session.id });
    return true;
  }

  if (action === 'pomodoro-skipbreak') {
    const session = await PomodoroSession.findByPk(parseInt(sessionId));
    if (!session) {
      await interaction.reply({
        content: 'Could not find the session.',
        ephemeral: true,
      });
      return true;
    }

    // Cancel the break timer
    const breakKey = `break_${session.guildId}_${session.channelId}`;
    const breakData = breakTimers.get(breakKey);
    if (breakData) {
      clearTimeout(breakData.timerId);
      breakTimers.delete(breakKey);
    }

    // Start a new pomodoro immediately
    const existingSession = await PomodoroSession.findOne({
      where: {
        channelId: session.channelId,
        isActive: true,
      },
    });

    if (existingSession) {
      await interaction.reply({
        content: 'There is already an active pomodoro timer in this channel!',
        ephemeral: true,
      });
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

    scheduleTimer(newSession, client);

    // Play TTS if in voice
    if (session.voiceChannelId && getConnection(session.guildId)) {
      playPomodoroStart(session.guildId).catch(err => console.error('TTS error:', err));
    }

    const participantMentions = session.participants.map(id => `<@${id}>`).join(', ');

    const fields = [
      { name: 'Duration', value: `${session.duration} minutes`, inline: true },
      { name: 'Break', value: `${session.breakDuration} minutes`, inline: true },
      { name: 'Ends At', value: `<t:${Math.floor(endsAt.getTime() / 1000)}:T>`, inline: true },
      { name: 'Participants', value: participantMentions || 'None yet' },
    ];
    if (session.voiceChannelId) {
      fields.push({ name: 'Voice Channel', value: `<#${session.voiceChannelId}>`, inline: true });
    }

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('Pomodoro Timer Started!')
      .setDescription(`Break skipped! A new ${session.duration} minute pomodoro has started!`)
      .addFields(fields)
      .setFooter({ text: `Started by ${interaction.user.username}` })
      .setTimestamp();

    const buttonRow = createActiveTimerButtons(newSession.id);
    await interaction.update({ embeds: [embed], components: [buttonRow] });
    return true;
  }

  if (action === 'pomodoro-repeat') {
    const session = await PomodoroSession.findByPk(parseInt(sessionId));
    if (!session) {
      await interaction.reply({
        content: 'Could not find the previous session to repeat.',
        ephemeral: true,
      });
      return true;
    }

    // Cancel any existing break timer for this channel
    const breakKey = `break_${session.guildId}_${session.channelId}`;
    const breakData = breakTimers.get(breakKey);
    if (breakData) {
      clearTimeout(breakData.timerId);
      breakTimers.delete(breakKey);
    }

    // Check if there's already an active timer in this channel
    const existingSession = await PomodoroSession.findOne({
      where: {
        channelId: session.channelId,
        isActive: true,
      },
    });

    if (existingSession) {
      await interaction.reply({
        content: 'There is already an active pomodoro timer in this channel!',
        ephemeral: true,
      });
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

    // Schedule the timer
    scheduleTimer(newSession, client);

    // Play TTS if in voice
    if (session.voiceChannelId && getConnection(session.guildId)) {
      playPomodoroStart(session.guildId).catch(err => console.error('TTS error:', err));
    }

    const participantMentions = session.participants.map(id => `<@${id}>`).join(', ');

    const fields = [
      { name: 'Duration', value: `${session.duration} minutes`, inline: true },
      { name: 'Break', value: `${session.breakDuration} minutes`, inline: true },
      { name: 'Ends At', value: `<t:${Math.floor(endsAt.getTime() / 1000)}:T>`, inline: true },
      { name: 'Participants', value: participantMentions || 'None yet' },
    ];
    if (session.voiceChannelId) {
      fields.push({ name: 'Voice Channel', value: `<#${session.voiceChannelId}>`, inline: true });
    }

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('Pomodoro Timer Started!')
      .setDescription(`A new ${session.duration} minute pomodoro has started! Click **Join** to participate!`)
      .addFields(fields)
      .setFooter({ text: `Started by ${interaction.user.username}` })
      .setTimestamp();

    const row = createActiveTimerButtons(newSession.id);
    await interaction.update({ embeds: [embed], components: [row] });
    return true;
  }

  if (action === 'pomodoro-dismiss') {
    await interaction.update({ components: [] });
    return true;
  }

  return false;
}

async function handleStart(interaction) {
  const duration = interaction.options.getInteger('duration') || 25;
  const breakDuration = interaction.options.getInteger('break') || 5;
  const voiceChannel = interaction.options.getChannel('voice');
  const channelId = interaction.channel.id;
  const guildId = interaction.guild.id;

  // Check if there's already an active timer in this channel
  const existingSession = await PomodoroSession.findOne({
    where: {
      channelId,
      isActive: true,
    },
  });

  if (existingSession) {
    const timeLeft = Math.ceil((new Date(existingSession.endsAt) - new Date()) / 60000);
    await interaction.reply({
      content: `There's already an active pomodoro timer in this channel with ${timeLeft} minutes remaining. Use \`/pomodoro join\` to join it!`,
      ephemeral: true,
    });
    return;
  }

  // Join voice channel if specified
  let voiceChannelId = null;
  if (voiceChannel) {
    try {
      await joinVC(voiceChannel);
      voiceChannelId = voiceChannel.id;
    } catch (error) {
      console.error('Failed to join voice channel:', error);
      await interaction.reply({
        content: 'Failed to join the voice channel. Starting timer without voice notifications.',
        ephemeral: true,
      });
    }
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

  // Schedule the timer completion
  scheduleTimer(session, interaction.client);

  // Play TTS announcement if in voice
  if (voiceChannelId) {
    playPomodoroStart(guildId).catch(err => console.error('TTS error:', err));
  }

  const fields = [
    { name: 'Duration', value: `${duration} minutes`, inline: true },
    { name: 'Break', value: `${breakDuration} minutes`, inline: true },
    { name: 'Ends At', value: `<t:${Math.floor(endsAt.getTime() / 1000)}:T>`, inline: true },
    { name: 'Participants', value: `<@${interaction.user.id}>` },
  ];

  if (voiceChannelId) {
    fields.push({ name: 'Voice Channel', value: `<#${voiceChannelId}>`, inline: true });
  }

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle('Pomodoro Timer Started!')
    .setDescription(
      `A ${duration} minute pomodoro session has started. Click **Join** to participate!`
    )
    .addFields(fields)
    .setFooter({ text: `Started by ${interaction.user.username}` })
    .setTimestamp();

  const row = createActiveTimerButtons(session.id);
  await interaction.reply({ embeds: [embed], components: [row] });
}

async function handleJoin(interaction) {
  const channelId = interaction.channel.id;

  const session = await PomodoroSession.findOne({
    where: {
      channelId,
      isActive: true,
    },
  });

  if (!session) {
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

  participants.push(interaction.user.id);
  session.participants = participants;
  await session.save();

  const timeLeft = Math.ceil((new Date(session.endsAt) - new Date()) / 60000);
  const participantMentions = participants.map(id => `<@${id}>`).join(', ');

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Joined Pomodoro Session!')
    .setDescription(`${interaction.user} has joined the pomodoro session!`)
    .addFields(
      { name: 'Time Remaining', value: `${timeLeft} minutes`, inline: true },
      { name: 'Participants', value: participantMentions }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleLeave(interaction) {
  const channelId = interaction.channel.id;

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

async function handleStatus(interaction) {
  const channelId = interaction.channel.id;

  const session = await PomodoroSession.findOne({
    where: {
      channelId,
      isActive: true,
    },
  });

  if (!session) {
    await interaction.reply({
      content:
        'No active pomodoro timer in this channel. Start one with `/pomodoro start`!',
      ephemeral: true,
    });
    return;
  }

  const now = new Date();
  const endsAt = new Date(session.endsAt);
  const timeLeftMs = endsAt - now;
  const timeLeftMins = Math.ceil(timeLeftMs / 60000);
  const timeLeftSecs = Math.ceil(timeLeftMs / 1000);

  const participantMentions = session.participants.map(id => `<@${id}>`).join(', ');

  // Format time remaining nicely
  let timeDisplay;
  if (timeLeftMins > 1) {
    timeDisplay = `${timeLeftMins} minutes`;
  } else if (timeLeftSecs > 0) {
    timeDisplay = `${timeLeftSecs} seconds`;
  } else {
    timeDisplay = 'Ending soon...';
  }

  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle('Pomodoro Timer Status')
    .addFields(
      { name: 'Duration', value: `${session.duration} minutes`, inline: true },
      { name: 'Time Remaining', value: timeDisplay, inline: true },
      { name: 'Ends At', value: `<t:${Math.floor(endsAt.getTime() / 1000)}:T>`, inline: true },
      { name: 'Participants', value: participantMentions || 'None' }
    )
    .setFooter({ text: `Started by user ${session.creatorId}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleStop(interaction) {
  const channelId = interaction.channel.id;

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

  // Leave voice channel if connected
  if (session.voiceChannelId) {
    leaveVC(session.guildId);
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

async function handleLeaderboard(interaction) {
  const timeframe = interaction.options.getString('timeframe') || 'alltime';
  const guildId = interaction.guild.id;

  const whereClause = { guildId };
  if (timeframe === 'daily') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    whereClause.createdAt = { [Op.gte]: today };
  }

  const cycles = await PomodoroCycle.findAll({
    where: whereClause,
    attributes: [
      'userDiscordId',
      [PomodoroCycle.sequelize.fn('COUNT', PomodoroCycle.sequelize.col('id')), 'cycleCount'],
      [PomodoroCycle.sequelize.fn('SUM', PomodoroCycle.sequelize.col('duration')), 'totalMinutes'],
    ],
    group: ['userDiscordId'],
    order: [[PomodoroCycle.sequelize.literal('cycleCount'), 'DESC']],
    limit: 10,
    raw: true,
  });

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
    ? `${interaction.guild.name} — Today's Pomodoro Leaderboard`
    : `${interaction.guild.name} — All-Time Pomodoro Leaderboard`;

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(title)
    .setDescription(entries.join('\n'))
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

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

async function completeTimer(session, client) {
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

  // Play TTS notification if in voice channel
  if (currentSession.voiceChannelId && getConnection(currentSession.guildId)) {
    playPomodoroComplete(currentSession.guildId).catch(err => console.error('TTS error:', err));
  }

  try {
    const channel = await client.channels.fetch(currentSession.channelId);
    if (!channel) return;

    const participantMentions = currentSession.participants.map(id => `<@${id}>`).join(' ');

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle('Pomodoro Complete!')
      .setDescription(
        `Great work! Your ${currentSession.duration} minute pomodoro session is complete. Time for a ${currentSession.breakDuration} minute break!`
      )
      .addFields({
        name: 'Participants',
        value: currentSession.participants.map(id => `<@${id}>`).join(', ') || 'None',
      })
      .setTimestamp();

    const breakButton = new ButtonBuilder()
      .setCustomId(`pomodoro-break_${currentSession.id}`)
      .setLabel(`Start ${currentSession.breakDuration}min Break`)
      .setStyle(ButtonStyle.Primary);

    const repeatButton = new ButtonBuilder()
      .setCustomId(`pomodoro-repeat_${currentSession.id}`)
      .setLabel('Skip Break & Start Another')
      .setStyle(ButtonStyle.Success);

    const dismissButton = new ButtonBuilder()
      .setCustomId(`pomodoro-dismiss_${currentSession.id}`)
      .setLabel('Dismiss')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(breakButton, repeatButton, dismissButton);

    await channel.send({
      content: participantMentions,
      embeds: [embed],
      components: [row],
    });
  } catch (error) {
    console.error('Failed to send pomodoro completion message:', error);
  }
}

async function completeBreak(session, client) {
  try {
    const channel = await client.channels.fetch(session.channelId);
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

    // Play TTS notification if in voice channel
    if (session.voiceChannelId && getConnection(session.guildId)) {
      playBreakComplete(session.guildId).catch(err => console.error('TTS error:', err));
    }

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

    const row = new ActionRowBuilder().addComponents(startButton, dismissButton);

    await channel.send({
      content: participantMentions,
      embeds: [embed],
      components: [row],
    });
  } catch (error) {
    console.error('Failed to send break completion message:', error);
  }
}

// Restore active timers on bot startup
export async function restoreTimers(client) {
  const activeSessions = await PomodoroSession.findAll({
    where: { isActive: true },
  });

  for (const session of activeSessions) {
    const now = new Date();
    const endsAt = new Date(session.endsAt);

    if (endsAt <= now) {
      // Timer should have already ended, complete it now
      await completeTimer(session, client);
    } else {
      // Reschedule the timer
      scheduleTimer(session, client);
    }
  }

  console.log(`Restored ${activeSessions.length} active pomodoro timer(s)`);
}
