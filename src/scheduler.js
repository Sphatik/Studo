import cron from 'node-cron';
import { Op } from 'sequelize';
import { ServerConfig } from './database/index.js';
import { generateDailySummaryEmbed } from './commands/leetcode.js';

/**
 * Starts the daily summary scheduler.
 * Sends a summary of yesterday's activity at 9am to each guild's tracking channel.
 * @param {import('discord.js').Client} client
 */
export function startScheduler(client) {
  // Run every day at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('Running daily LeetCode summary...');

    const configs = await ServerConfig.findAll({
      where: { trackingChannelId: { [Op.ne]: null } },
    });

    for (const config of configs) {
      try {
        const channel = await client.channels.fetch(config.trackingChannelId);
        if (!channel) continue;

        const embed = await generateDailySummaryEmbed(config.guildId);
        if (!embed) continue;

        await channel.send({ embeds: [embed] });
      } catch (error) {
        console.error(`Failed to send daily summary to guild ${config.guildId}:`, error.message);
      }
    }

    console.log('Daily summary complete.');
  });

  console.log('Scheduler started: Daily summary at 9:00 AM');
}
