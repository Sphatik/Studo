import 'dotenv/config';
import { Client, Events, GatewayIntentBits, type Interaction } from 'discord.js';
import { sequelize } from './database/index.js';
import { execute as leetcodeExecute } from './commands/leetcode.js';
import { execute as logExecute } from './commands/log.js';
import {
  execute as pomodoroExecute,
  handleButtonInteraction as _pomodoroButtonHandler,
  restoreTimers as restorePomodoroTimers,
} from './commands/pomodoro.js';
import {
  execute as pomodoro2Execute,
  handleButtonInteraction as pomodoro2ButtonHandler,
} from './commands/pomodoro/pomodoro.js';
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

  // Disable foreign key checks during sync to avoid SQLite constraints
  await sequelize.query('PRAGMA foreign_keys = OFF;');
  await sequelize.sync({ alter: true });
  await sequelize.query('PRAGMA foreign_keys = ON;');
  console.log('Database synced!');

  startScheduler(client);
  await restorePomodoroTimers(client);
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  // Handle button interactions
  if (interaction.isButton()) {
    // await pomodoroButtonHandler(interaction, client);
    await pomodoro2ButtonHandler(interaction, client);
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong!');
  } else if (interaction.commandName === 'leetcode') {
    await leetcodeExecute(interaction);
  } else if (interaction.commandName === 'log') {
    await logExecute(interaction);
  } else if (interaction.commandName === 'pomodoro') {
    await pomodoroExecute(interaction);
  } else if (interaction.commandName === 'pomodoro2') {
    await pomodoro2Execute(interaction);
  }
});

client.on(Events.MessageCreate, handleMessageCreate);
client.on(Events.VoiceStateUpdate, handleVoiceStateUpdate);

client.login(process.env.TOKEN);
