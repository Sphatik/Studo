import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { data as leetcodeCommand } from './commands/leetcode.js';
import { data as logCommand } from './commands/log.js';
import { data as pomodoroCommand } from './commands/pomodoro/pomodoro.js';

const commands = [
  {
    name: 'ping',
    description: 'Replies with Pong!',
  },
  leetcodeCommand.toJSON(),
  logCommand.toJSON(),
  pomodoroCommand.toJSON(),
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

try {
  console.log('Started refreshing application (/) commands.');

  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });

  console.log('Successfully reloaded application (/) commands.');
} catch (error) {
  console.error(error);
}