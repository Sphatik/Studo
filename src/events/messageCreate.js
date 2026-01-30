import { User, Submission, ServerConfig } from '../database/index.js';
import { extractLeetCodeProblems, verifyLeetCodeProblem } from '../utils/leetcode.js';

/**
 * Handles incoming messages to detect and track LeetCode problem links.
 * @param {import('discord.js').Message} message
 */
export async function handleMessageCreate(message) {
  // Ignore bot messages
  if (message.author.bot) return;

  // Must be in a guild
  if (!message.guild) return;

  // Check if this channel is configured for tracking
  const config = await ServerConfig.findByPk(message.guild.id);
  if (!config || config.trackingChannelId !== message.channel.id) return;

  // Extract LeetCode problems from message
  const problems = extractLeetCodeProblems(message.content);
  if (problems.length === 0) return;

  // Ensure user exists in database
  const [user] = await User.findOrCreate({
    where: { discordId: message.author.id },
    defaults: {
      discordId: message.author.id,
      username: message.author.username,
    },
  });

  // Update username if changed
  if (user.username !== message.author.username) {
    user.username = message.author.username;
    await user.save();
  }

  // Track each problem
  const newSubmissions = [];
  for (const problem of problems) {
    // Check for recent duplicate (same user, same problem, same guild, within 24 hours)
    const recentSubmission = await Submission.findOne({
      where: {
        userDiscordId: message.author.id,
        problemSlug: problem.slug,
        guildId: message.guild.id,
      },
      order: [['createdAt', 'DESC']],
    });

    if (recentSubmission) {
      const hoursSince = (Date.now() - recentSubmission.createdAt.getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24) continue;
    }

    // Verify the problem actually exists on LeetCode
    const isValid = await verifyLeetCodeProblem(problem.slug);
    if (!isValid) continue;

    // Create submission record
    const submission = await Submission.create({
      problemUrl: problem.url,
      problemSlug: problem.slug,
      problemTitle: problem.title,
      guildId: message.guild.id,
      userDiscordId: message.author.id,
    });

    newSubmissions.push(submission);
  }

  // Update user's total and reply
  if (newSubmissions.length > 0) {
    user.totalSolved += newSubmissions.length;
    await user.save();

    const problemNames = newSubmissions.map(s => `**${s.problemTitle}**`).join(', ');
    await message.reply({
      content: `Tracked ${newSubmissions.length} problem(s): ${problemNames}\nYour total: **${user.totalSolved}** problems solved!`,
      allowedMentions: { repliedUser: false },
    });
  }
}
