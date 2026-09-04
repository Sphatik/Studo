import cron from 'node-cron';
import { Op } from 'sequelize';
import { ServerConfig } from './database/index.ts';
import { generateDailySummaryEmbed } from './commands/leetcode.js';
import { generateStudySummaryEmbed, generateStudySummaryImage, generateTopStudierGif } from './commands/log.js';

// All schedules are pinned to Pacific time so they are unaffected by the
// server's local timezone and by daylight saving transitions.
const TIMEZONE = 'America/Los_Angeles';

/**
 * Starts the daily summary schedulers.
 * @param {import('discord.js').Client} client
 */
export function startScheduler(client) {
  // LeetCode summary: Run every day at 9:00 AM Pacific
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
  }, { timezone: TIMEZONE });

  // Study summary: Run at 11:59 PM Pacific so it covers the full Pacific day
  // that is about to end (summaries only include the current Pacific day).
  cron.schedule('59 23 * * *', async () => {
    console.log('Running daily study summary...');

    const configs = await ServerConfig.findAll({
      where: { studySummaryChannelId: { [Op.ne]: null } },
    });

    for (const config of configs) {
      try {
        const channel = await client.channels.fetch(config.studySummaryChannelId);
        if (!channel) continue;

        const attachment = await generateStudySummaryImage();
        if (attachment) {
          const gif = await generateTopStudierGif(client);
          await channel.send({ files: gif ? [attachment, gif] : [attachment] });
          continue;
        }

        // Fall back to the embed if the image could not be generated
        const embed = await generateStudySummaryEmbed();
        if (!embed) continue;

        await channel.send({ embeds: [embed] });
      } catch (error) {
        console.error(`Failed to send study summary to guild ${config.guildId}:`, error.message);
      }
    }

    console.log('Daily study summary complete.');
  }, { timezone: TIMEZONE });

  console.log('Scheduler started: LeetCode summary at 9:00 AM Pacific, Study summary at 11:59 PM Pacific');
}
