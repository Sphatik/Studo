import 'dotenv/config';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { sequelize } from './database/index.js';
import { execute as leetcodeExecute } from './commands/leetcode.js';
import { execute as logExecute } from './commands/log.js';
import { handleMessageCreate } from './events/messageCreate.js';
import { handleVoiceStateUpdate } from './events/voiceStateUpdate.js';
import { startScheduler } from './scheduler.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.on(Events.ClientReady, async readyClient => {
  console.log(`Logged in as ${readyClient.user.tag}!`);

  await sequelize.sync({ alter: true });
  console.log('Database synced!');

  startScheduler(client);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong!');
  } else if (interaction.commandName === 'leetcode') {
    await leetcodeExecute(interaction);
  } else if (interaction.commandName === 'log') {
    await logExecute(interaction);
  }
});

client.on(Events.MessageCreate, handleMessageCreate);
client.on(Events.VoiceStateUpdate, handleVoiceStateUpdate);

client.login(process.env.TOKEN);
