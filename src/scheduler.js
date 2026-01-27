import cron from 'node-cron';
import { Op } from 'sequelize';
import { ServerConfig } from './database/index.js';
import { generateDailySummaryEmbed } from './commands/leetcode.js';
import { generateStudySummaryEmbed } from './commands/log.js';

/**
 * Starts the daily summary schedulers.
 * @param {import('discord.js').Client} client
 */
export function startScheduler(client) {
  // LeetCode summary: Run every day at 9:00 AM
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
        console.error(`Failed to send LeetCode summary to guild ${config.guildId}:`, error.message);
      }
    }

    console.log('Daily LeetCode summary complete.');
  });

  // Study summary: Run every day at 9:00 PM PST (05:00 UTC next day)
  cron.schedule('0 5 * * *', async () => {
    console.log('Running daily study summary...');

    const configs = await ServerConfig.findAll({
      where: { studySummaryChannelId: { [Op.ne]: null } },
    });

    for (const config of configs) {
      try {
        const channel = await client.channels.fetch(config.studySummaryChannelId);
        if (!channel) continue;

        const embed = await generateStudySummaryEmbed(config.guildId);
        if (!embed) continue;

        await channel.send({ embeds: [embed] });
      } catch (error) {
        console.error(`Failed to send study summary to guild ${config.guildId}:`, error.message);
      }
    }

    console.log('Daily study summary complete.');
  });

  console.log('Scheduler started: LeetCode summary at 9:00 AM, Study summary at 9:00 PM PST');
}
