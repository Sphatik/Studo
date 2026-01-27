import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { Op } from 'sequelize';
import { User, StudyLog, VoiceSession, ServerConfig } from '../database/index.js';

export const data = new SlashCommandBuilder()
  .setName('log')
  .setDescription('Study log commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription('Log what you are studying')
      .addStringOption(option =>
        option
          .setName('activity')
          .setDescription('What are you working on?')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('today')
      .setDescription('View today\'s study logs')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('stats')
      .setDescription('View study stats for a user')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('User to view stats for (defaults to yourself)')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('setcategory')
      .setDescription('Set the study voice channel category (Admin only)')
      .addChannelOption(option =>
        option
          .setName('category')
          .setDescription('Category containing study voice channels')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('setchannel')
      .setDescription('Set the daily summary channel (Admin only)')
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('Channel to post daily summaries')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('summary')
      .setDescription('Preview today\'s daily summary')
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'add':
      await handleAdd(interaction);
      break;
    case 'today':
      await handleToday(interaction);
      break;
    case 'stats':
      await handleStats(interaction);
      break;
    case 'setcategory':
      await handleSetCategory(interaction);
      break;
    case 'setchannel':
      await handleSetChannel(interaction);
      break;
    case 'summary':
      await handleSummary(interaction);
      break;
  }
}

async function handleAdd(interaction) {
  const activity = interaction.options.getString('activity');

  await User.findOrCreate({
    where: { discordId: interaction.user.id },
    defaults: { username: interaction.user.username },
  });

  await StudyLog.create({
    userDiscordId: interaction.user.id,
    guildId: interaction.guild.id,
    content: activity,
  });

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setDescription(`Logged: **${activity}**`)
    .setFooter({ text: `${interaction.user.username}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

async function handleToday(interaction) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const logs = await StudyLog.findAll({
    where: {
      guildId: interaction.guild.id,
      createdAt: { [Op.gte]: today },
    },
    order: [['createdAt', 'ASC']],
  });

  const sessions = await VoiceSession.findAll({
    where: {
      guildId: interaction.guild.id,
      joinedAt: { [Op.gte]: today },
      leftAt: { [Op.ne]: null },
    },
  });

  if (logs.length === 0 && sessions.length === 0) {
    await interaction.reply({
      content: 'No study activity today yet. Use `/log add` to log what you\'re working on!',
      ephemeral: true,
    });
    return;
  }

  const userActivity = new Map();

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (!userActivity.has(log.userDiscordId)) {
      userActivity.set(log.userDiscordId, { logs: [], minutes: 0 });
    }

    const nextLog = logs.find(
      (l, j) => j > i && l.userDiscordId === log.userDiscordId
    );
    const endTime = nextLog ? new Date(nextLog.createdAt) : new Date();
    const durationMins = Math.floor((endTime - new Date(log.createdAt)) / 60000);

    userActivity.get(log.userDiscordId).logs.push({
      content: log.content,
      duration: durationMins,
    });
  }

  for (const session of sessions) {
    if (!userActivity.has(session.userDiscordId)) {
      userActivity.set(session.userDiscordId, { logs: [], minutes: 0 });
    }
    userActivity.get(session.userDiscordId).minutes += session.durationMinutes || 0;
  }

  const entries = await Promise.all(
    Array.from(userActivity.entries()).map(async ([discordId, data]) => {
      const user = await User.findByPk(discordId);
      const username = user?.username || 'Unknown';
      const hours = Math.floor(data.minutes / 60);
      const mins = data.minutes % 60;
      const timeStr = data.minutes > 0
        ? `${hours > 0 ? `${hours}h ` : ''}${mins}m in voice`
        : '';

      const logsStr = data.logs.length > 0
        ? data.logs.map(l => `${l.content} (${formatDuration(l.duration)})`).join(', ')
        : '';

      const parts = [logsStr, timeStr].filter(Boolean);
      return `**${username}**: ${parts.join(' | ') || 'Active in voice'}`;
    })
  );

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`Today's Study Activity`)
    .setDescription(entries.join('\n\n'))
    .setFooter({ text: `${userActivity.size} member(s) active today` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleStats(interaction) {
  const targetUser = interaction.options.getUser('user') || interaction.user;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [todayLogs, weekLogs, todaySessions, weekSessions] = await Promise.all([
    StudyLog.count({
      where: {
        userDiscordId: targetUser.id,
        guildId: interaction.guild.id,
        createdAt: { [Op.gte]: today },
      },
    }),
    StudyLog.count({
      where: {
        userDiscordId: targetUser.id,
        guildId: interaction.guild.id,
        createdAt: { [Op.gte]: weekAgo },
      },
    }),
    VoiceSession.findAll({
      where: {
        userDiscordId: targetUser.id,
        guildId: interaction.guild.id,
        joinedAt: { [Op.gte]: today },
        leftAt: { [Op.ne]: null },
      },
    }),
    VoiceSession.findAll({
      where: {
        userDiscordId: targetUser.id,
        guildId: interaction.guild.id,
        joinedAt: { [Op.gte]: weekAgo },
        leftAt: { [Op.ne]: null },
      },
    }),
  ]);

  const todayMinutes = todaySessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  const weekMinutes = weekSessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);

  const formatTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins}m`;
  };

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`${targetUser.username}'s Study Stats`)
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      { name: 'Today', value: `${todayLogs} logs | ${formatTime(todayMinutes)} voice`, inline: true },
      { name: 'This Week', value: `${weekLogs} logs | ${formatTime(weekMinutes)} voice`, inline: true }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleSetCategory(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: 'You need Administrator permissions to use this command.',
      ephemeral: true,
    });
    return;
  }

  const category = interaction.options.getChannel('category');

  if (category.type !== 4) {
    await interaction.reply({
      content: 'Please select a category channel, not a text or voice channel.',
      ephemeral: true,
    });
    return;
  }

  const [config] = await ServerConfig.findOrCreate({
    where: { guildId: interaction.guild.id },
  });

  config.studyCategoryId = category.id;
  await config.save();

  await interaction.reply({
    content: `Study category set to **${category.name}**. Voice time in channels under this category will be tracked!`,
  });
}

async function handleSetChannel(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: 'You need Administrator permissions to use this command.',
      ephemeral: true,
    });
    return;
  }

  const channel = interaction.options.getChannel('channel');

  const [config] = await ServerConfig.findOrCreate({
    where: { guildId: interaction.guild.id },
  });

  config.studySummaryChannelId = channel.id;
  await config.save();

  await interaction.reply({
    content: `Daily study summary will be posted to ${channel} at 9 PM PST.`,
  });
}

async function handleSummary(interaction) {
  const embed = await generateStudySummaryEmbed(interaction.guild.id);

  if (!embed) {
    await interaction.reply({
      content: 'No study activity today yet. Use `/log add` to log what you\'re working on!',
      ephemeral: true,
    });
    return;
  }

  embed.setTitle(`Daily Study Summary`);

  await interaction.reply({ embeds: [embed] });
}

/**
 * Generates the daily study summary embed for a guild.
 * Exported for use by the scheduler.
 */
export async function generateStudySummaryEmbed(guildId) {
  const now = new Date();

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const logs = await StudyLog.findAll({
    where: {
      guildId,
      createdAt: { [Op.gte]: todayStart },
    },
    order: [['createdAt', 'ASC']],
  });

  const sessions = await VoiceSession.findAll({
    where: {
      guildId,
      joinedAt: { [Op.gte]: todayStart },
      leftAt: { [Op.ne]: null },
    },
  });

  if (logs.length === 0 && sessions.length === 0) {
    return null;
  }

  const userActivity = new Map();

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (!userActivity.has(log.userDiscordId)) {
      userActivity.set(log.userDiscordId, { logs: [], minutes: 0 });
    }

    const nextLog = logs.find(
      (l, j) => j > i && l.userDiscordId === log.userDiscordId
    );
    const endTime = nextLog ? new Date(nextLog.createdAt) : new Date();
    const durationMins = Math.floor((endTime - new Date(log.createdAt)) / 60000);

    userActivity.get(log.userDiscordId).logs.push({
      content: log.content,
      duration: durationMins,
    });
  }

  for (const session of sessions) {
    if (!userActivity.has(session.userDiscordId)) {
      userActivity.set(session.userDiscordId, { logs: [], minutes: 0 });
    }
    userActivity.get(session.userDiscordId).minutes += session.durationMinutes || 0;
  }

  const entries = await Promise.all(
    Array.from(userActivity.entries()).map(async ([discordId, data]) => {
      const user = await User.findByPk(discordId);
      const username = user?.username || 'Unknown';
      const hours = Math.floor(data.minutes / 60);
      const mins = data.minutes % 60;
      const timeStr = data.minutes > 0
        ? `${hours > 0 ? `${hours}h ` : ''}${mins}m in voice`
        : '';

      const logsStr = data.logs.length > 0
        ? data.logs.map(l => `${l.content} (${formatDuration(l.duration)})`).join(', ')
        : '';

      const parts = [logsStr, timeStr].filter(Boolean);
      return `**${username}**: ${parts.join(' | ') || 'Active in voice'}`;
    })
  );

  const totalMinutes = sessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalMins = totalMinutes % 60;

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`Daily Study Summary`)
    .setDescription(entries.join('\n\n'))
    .setFooter({
      text: `${userActivity.size} member(s) | ${logs.length} logs | ${totalHours}h ${totalMins}m total voice time`
    })
    .setTimestamp();
}
