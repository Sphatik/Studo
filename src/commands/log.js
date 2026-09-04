import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { Op } from 'sequelize';
import { User, VoiceSession, ServerConfig } from '../database/index.ts';
import { renderStudySummaryImage } from '../utils/summaryImage.js';
import { renderSpinningAvatarGif } from '../utils/spinGif.js';

export const data = new SlashCommandBuilder()
  .setName('log')
  .setDescription('Study time commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('today')
      .setDescription('View today\'s study time')
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
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('leaderboard')
      .setDescription('Global study time leaderboard')
      .addStringOption(option =>
        option
          .setName('timeframe')
          .setDescription('Ranking window (default: day)')
          .setRequired(false)
          .addChoices(
            { name: 'Day (last 24 hours)', value: 'day' },
            { name: 'Week (last 7 days)', value: 'week' }
          )
      )
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
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
    case 'leaderboard':
      await handleLeaderboard(interaction);
      break;
  }
}

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

/**
 * Aggregates completed study voice time per user since the given time.
 * Sessions are counted across every server the bot is in, so the numbers are
 * global rather than per-guild. Returns entries sorted by minutes descending.
 */
async function collectStudyActivity(since) {
  const sessions = await VoiceSession.findAll({
    where: {
      joinedAt: { [Op.gte]: since },
      leftAt: { [Op.ne]: null },
    },
  });

  const byUser = new Map();
  for (const session of sessions) {
    const current = byUser.get(session.userDiscordId) || { discordId: session.userDiscordId, minutes: 0 };
    current.minutes += session.durationMinutes || 0;
    byUser.set(session.userDiscordId, current);
  }

  const entries = await Promise.all(
    Array.from(byUser.values()).map(async (entry) => {
      const user = await User.findByPk(entry.discordId);
      return { ...entry, username: user?.username || 'Unknown' };
    })
  );

  entries.sort((a, b) => b.minutes - a.minutes);

  return {
    entries,
    totalMinutes: entries.reduce((sum, e) => sum + e.minutes, 0),
  };
}

async function handleToday(interaction) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { entries, totalMinutes } = await collectStudyActivity(today);
  const active = entries.filter(e => e.minutes > 0);

  if (active.length === 0) {
    await interaction.reply({
      content: 'No study time tracked today yet. Hop into a study voice channel!',
      ephemeral: true,
    });
    return;
  }

  const lines = active.map(e => `**${e.username}** — ${formatDuration(e.minutes)}`);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Today\'s Study Time')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `${active.length} member(s) | ${formatDuration(totalMinutes)} total` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleStats(interaction) {
  const targetUser = interaction.options.getUser('user') || interaction.user;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Stats are aggregated across all servers the bot shares with the user,
  // so study hours carry over no matter where they were earned.
  const [todaySessions, weekSessions] = await Promise.all([
    VoiceSession.findAll({
      where: {
        userDiscordId: targetUser.id,
        joinedAt: { [Op.gte]: today },
        leftAt: { [Op.ne]: null },
      },
    }),
    VoiceSession.findAll({
      where: {
        userDiscordId: targetUser.id,
        joinedAt: { [Op.gte]: weekAgo },
        leftAt: { [Op.ne]: null },
      },
    }),
  ]);

  const todayMinutes = todaySessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
  const weekMinutes = weekSessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`${targetUser.username}'s Study Stats`)
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      { name: 'Today', value: formatDuration(todayMinutes), inline: true },
      { name: 'This Week', value: formatDuration(weekMinutes), inline: true }
    )
    .setFooter({ text: 'Tracked across all servers' })
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
    content: `Daily study summary will be posted to ${channel} at midnight Pacific.`,
  });
}

async function handleLeaderboard(interaction) {
  const timeframe = interaction.options.getString('timeframe') || 'day';
  const windowMs = timeframe === 'week'
    ? 7 * 24 * 60 * 60 * 1000
    : 24 * 60 * 60 * 1000;
  const since = new Date(Date.now() - windowMs);

  const { entries } = await collectStudyActivity(since);
  const ranked = entries.filter(e => e.minutes > 0).slice(0, 10);

  if (ranked.length === 0) {
    await interaction.reply({
      content: `No study time tracked in the last ${timeframe === 'week' ? '7 days' : '24 hours'} yet. Hop into a study voice channel!`,
      ephemeral: true,
    });
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = ranked.map((entry, i) => {
    const rank = medals[i] || `**${i + 1}.**`;
    return `${rank} **${entry.username}** — ${formatDuration(entry.minutes)}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(`Global Study Leaderboard — ${timeframe === 'week' ? 'Last 7 Days' : 'Last 24 Hours'}`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `${ranked.length} member(s) ranked by time studied in voice` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleSummary(interaction) {
  await interaction.deferReply();

  const attachment = await generateStudySummaryImage();

  if (attachment) {
    const gif = await generateTopStudierGif(interaction.client);
    await interaction.editReply({ files: gif ? [attachment, gif] : [attachment] });
    return;
  }

  // Fall back to the embed if the image could not be generated
  const embed = await generateStudySummaryEmbed();

  if (!embed) {
    await interaction.editReply({
      content: 'No study time tracked today yet. Hop into a study voice channel!',
    });
    return;
  }

  embed.setTitle('Daily Study Summary');

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Renders the global last-24h study summary as a PNG attachment.
 * Returns null if there was no activity or rendering failed.
 * Exported for use by the scheduler.
 */
export async function generateStudySummaryImage() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const activity = await collectStudyActivity(since);

  if (activity.entries.length === 0) return null;

  try {
    const buffer = renderStudySummaryImage({
      title: 'Daily Study Summary',
      subtitle: new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      entries: activity.entries,
      totalMinutes: activity.totalMinutes,
    });
    return new AttachmentBuilder(buffer, { name: 'study-summary.png' });
  } catch (error) {
    console.error('Failed to render study summary image:', error.message);
    return null;
  }
}

/**
 * Renders a spinning-avatar GIF for whoever studied the most in the last 24h
 * across all servers. Returns null if nobody studied, or if the avatar/GIF
 * could not be produced. Exported for use by the scheduler.
 *
 * @param {import('discord.js').Client} client
 */
export async function generateTopStudierGif(client) {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { entries } = await collectStudyActivity(since);
    const top = entries.find(e => e.minutes > 0);
    if (!top) return null;

    const user = await client.users.fetch(top.discordId);
    const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });

    const response = await fetch(avatarUrl);
    if (!response.ok) return null;
    const avatar = Buffer.from(await response.arrayBuffer());

    const buffer = await renderSpinningAvatarGif({
      avatar,
      username: user.displayName || user.username || top.username,
      minutes: top.minutes,
    });

    return new AttachmentBuilder(buffer, { name: 'top-studier.gif' });
  } catch (error) {
    console.error('Failed to render top studier GIF:', error.message);
    return null;
  }
}

/**
 * Generates the global daily study summary embed.
 * Exported for use by the scheduler.
 */
export async function generateStudySummaryEmbed() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const { entries, totalMinutes } = await collectStudyActivity(since);
  const active = entries.filter(e => e.minutes > 0);

  if (active.length === 0) return null;

  const lines = active
    .slice(0, 10)
    .map((e, i) => `**${i + 1}.** ${e.username} — ${formatDuration(e.minutes)}`);

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Last 24 Hours Study Summary')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `${active.length} member(s) | ${formatDuration(totalMinutes)} total study time` })
    .setTimestamp();
}
