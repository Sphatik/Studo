import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { Op } from 'sequelize';
import { User, Submission, ServerConfig } from '../database/index.js';
import { verifyLeetCodeProblem } from '../utils/leetcode.js';

export const data = new SlashCommandBuilder()
  .setName('leetcode')
  .setDescription('LeetCode activity tracking commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('stats')
      .setDescription('View LeetCode stats')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('User to view stats for (defaults to yourself)')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand.setName('leaderboard').setDescription('View the server leaderboard')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('setchannel')
      .setDescription('Set the LeetCode tracking channel (Admin only)')
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('Channel to track LeetCode submissions in')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand.setName('today').setDescription('View who solved problems today')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('purge')
      .setDescription('Remove submissions with invalid LeetCode links (Admin only)')
  );

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'stats':
      await handleStats(interaction);
      break;
    case 'leaderboard':
      await handleLeaderboard(interaction);
      break;
    case 'setchannel':
      await handleSetChannel(interaction);
      break;
    case 'today':
      await handleToday(interaction);
      break;
    case 'purge':
      await handlePurge(interaction);
      break;
  }
}

async function handleStats(interaction) {
  const targetUser = interaction.options.getUser('user') || interaction.user;

  const user = await User.findByPk(targetUser.id);

  if (!user) {
    await interaction.reply({
      content: `${targetUser.username} hasn't solved any problems yet!`,
      ephemeral: true,
    });
    return;
  }

  // Get recent submissions for this guild
  const recentSubmissions = await Submission.findAll({
    where: {
      userDiscordId: targetUser.id,
      guildId: interaction.guild.id,
    },
    order: [['createdAt', 'DESC']],
    limit: 5,
  });

  // Get guild-specific count
  const guildCount = await Submission.count({
    where: {
      userDiscordId: targetUser.id,
      guildId: interaction.guild.id,
    },
  });

  const embed = new EmbedBuilder()
    .setColor(0xffa116)
    .setTitle(`${targetUser.username}'s LeetCode Stats`)
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      { name: 'Problems Solved (This Server)', value: guildCount.toString(), inline: true },
      { name: 'Total Problems Solved', value: user.totalSolved.toString(), inline: true }
    );

  if (recentSubmissions.length > 0) {
    const recentList = recentSubmissions
      .map(s => `[${s.problemTitle}](${s.problemUrl})`)
      .join('\n');
    embed.addFields({ name: 'Recent Submissions', value: recentList });
  }

  await interaction.reply({ embeds: [embed] });
}

async function handleLeaderboard(interaction) {
  // Get top 10 users for this guild
  const submissions = await Submission.findAll({
    where: { guildId: interaction.guild.id },
    attributes: [
      'userDiscordId',
      [Submission.sequelize.fn('COUNT', Submission.sequelize.col('id')), 'count'],
    ],
    group: ['userDiscordId'],
    order: [[Submission.sequelize.literal('count'), 'DESC']],
    limit: 10,
    raw: true,
  });

  if (submissions.length === 0) {
    await interaction.reply({
      content: 'No submissions tracked yet! Share some LeetCode links to get started.',
      ephemeral: true,
    });
    return;
  }

  // Build leaderboard entries
  const entries = await Promise.all(
    submissions.map(async (sub, index) => {
      const user = await User.findByPk(sub.userDiscordId);
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      return `${medal} **${user?.username || 'Unknown'}** - ${sub.count} problems`;
    })
  );

  const embed = new EmbedBuilder()
    .setColor(0xffa116)
    .setTitle(`${interaction.guild.name} LeetCode Leaderboard`)
    .setDescription(entries.join('\n'))
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleSetChannel(interaction) {
  // Check for admin permissions
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: 'You need Administrator permissions to use this command.',
      ephemeral: true,
    });
    return;
  }

  const channel = interaction.options.getChannel('channel');

  await ServerConfig.upsert({
    guildId: interaction.guild.id,
    trackingChannelId: channel.id,
  });

  await interaction.reply({
    content: `LeetCode tracking channel set to ${channel}. Any LeetCode problem links shared there will be tracked!`,
  });
}

async function handleToday(interaction) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const submissions = await Submission.findAll({
    where: {
      guildId: interaction.guild.id,
      createdAt: { [Op.gte]: today },
    },
    order: [['createdAt', 'ASC']],
  });

  if (submissions.length === 0) {
    await interaction.reply({
      content: 'No problems solved today yet. Be the first!',
      ephemeral: true,
    });
    return;
  }

  // Group submissions by user
  const userSubmissions = new Map();
  for (const sub of submissions) {
    if (!userSubmissions.has(sub.userDiscordId)) {
      userSubmissions.set(sub.userDiscordId, []);
    }
    userSubmissions.get(sub.userDiscordId).push(sub);
  }

  // Build entries
  const entries = await Promise.all(
    Array.from(userSubmissions.entries()).map(async ([discordId, subs]) => {
      const user = await User.findByPk(discordId);
      const problems = subs.map(s => `[${s.problemTitle}](${s.problemUrl})`).join(', ');
      return `**${user?.username || 'Unknown'}** (${subs.length}): ${problems}`;
    })
  );

  const embed = new EmbedBuilder()
    .setColor(0xffa116)
    .setTitle("Today's LeetCode Activity")
    .setDescription(entries.join('\n\n'))
    .setFooter({
      text: `${submissions.length} problem(s) solved by ${userSubmissions.size} member(s)`,
    })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handlePurge(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: 'You need Administrator permissions to use this command.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  const submissions = await Submission.findAll({
    where: { guildId: interaction.guild.id },
  });

  if (submissions.length === 0) {
    await interaction.editReply('No submissions to check.');
    return;
  }

  // Get unique slugs to minimize API calls
  const slugs = [...new Set(submissions.map(s => s.problemSlug))];
  const invalidSlugs = new Set();

  for (const slug of slugs) {
    const isValid = await verifyLeetCodeProblem(slug);
    if (!isValid) {
      invalidSlugs.add(slug);
    }
  }

  if (invalidSlugs.size === 0) {
    await interaction.editReply('All submissions are valid. No fake links found.');
    return;
  }

  // Find all submissions with invalid slugs
  const invalidSubmissions = submissions.filter(s => invalidSlugs.has(s.problemSlug));

  // Group removed count per user to fix totalSolved
  const removedPerUser = new Map();
  for (const sub of invalidSubmissions) {
    removedPerUser.set(sub.userDiscordId, (removedPerUser.get(sub.userDiscordId) || 0) + 1);
  }

  // Delete invalid submissions
  await Submission.destroy({
    where: {
      guildId: interaction.guild.id,
      problemSlug: { [Op.in]: [...invalidSlugs] },
    },
  });

  // Adjust totalSolved for affected users
  for (const [discordId, count] of removedPerUser) {
    const user = await User.findByPk(discordId);
    if (user) {
      user.totalSolved = Math.max(0, user.totalSolved - count);
      await user.save();
    }
  }

  const slugList = [...invalidSlugs].map(s => `\`${s}\``).join(', ');
  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle('Purge Complete')
    .addFields(
      { name: 'Invalid Problems', value: slugList },
      { name: 'Submissions Removed', value: invalidSubmissions.length.toString(), inline: true },
      { name: 'Users Affected', value: removedPerUser.size.toString(), inline: true }
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Generates the daily summary embed for a guild.
 * Exported for use by the scheduler.
 */
export async function generateDailySummaryEmbed(guildId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const submissions = await Submission.findAll({
    where: {
      guildId,
      createdAt: {
        [Op.gte]: yesterday,
        [Op.lt]: today,
      },
    },
    order: [['createdAt', 'ASC']],
  });

  if (submissions.length === 0) {
    return null;
  }

  // Group submissions by user
  const userSubmissions = new Map();
  for (const sub of submissions) {
    if (!userSubmissions.has(sub.userDiscordId)) {
      userSubmissions.set(sub.userDiscordId, []);
    }
    userSubmissions.get(sub.userDiscordId).push(sub);
  }

  // Build entries
  const entries = await Promise.all(
    Array.from(userSubmissions.entries()).map(async ([discordId, subs]) => {
      const user = await User.findByPk(discordId);
      const problems = subs.map(s => `[${s.problemTitle}](${s.problemUrl})`).join(', ');
      return `**${user?.username || 'Unknown'}** (${subs.length}): ${problems}`;
    })
  );

  return new EmbedBuilder()
    .setColor(0xffa116)
    .setTitle("Yesterday's LeetCode Summary")
    .setDescription(entries.join('\n\n'))
    .setFooter({
      text: `${submissions.length} problem(s) solved by ${userSubmissions.size} member(s)`,
    })
    .setTimestamp();
}
