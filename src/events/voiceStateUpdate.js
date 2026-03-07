import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { User, VoiceSession, ServerConfig, PomodoroSession } from '../database/index.js';
import { Cooldown } from '../utils/cooldown.js';
import { joinPromptMessages } from '../commands/pomodoro/pomodoro.js';

// Per-user cooldown: 2 minutes between pomodoro join prompts
const pomodoroPromptCooldown = new Cooldown(2 * 60 * 1000);

export async function handleVoiceStateUpdate(oldState, newState) {
  const guildId = newState.guild?.id || oldState.guild?.id;
  if (!guildId) return;

  const config = await ServerConfig.findByPk(guildId);

  const userId = newState.member?.id || oldState.member?.id;
  const username = newState.member?.user?.username || oldState.member?.user?.username;
  if (!userId) return;

  const oldChannel = oldState.channel;
  const newChannel = newState.channel;

  if (config?.studyCategoryId) {
    const wasInStudyCategory = oldChannel?.parentId === config.studyCategoryId;
    const isInStudyCategory = newChannel?.parentId === config.studyCategoryId;

    if (!wasInStudyCategory && isInStudyCategory) {
      await handleJoinStudyChannel(userId, username, guildId, newChannel.id);
    } else if (wasInStudyCategory && !isInStudyCategory) {
      await handleLeaveStudyChannel(userId, guildId);
    } else if (wasInStudyCategory && isInStudyCategory && oldChannel?.id !== newChannel?.id) {
      await handleLeaveStudyChannel(userId, guildId);
      await handleJoinStudyChannel(userId, username, guildId, newChannel.id);
    }
  }

  // If user just joined a VC that has an active pomodoro session, prompt them to join
  const joinedNewChannel = !oldChannel && newChannel || (oldChannel?.id !== newChannel?.id && newChannel);
  if (joinedNewChannel && config?.pomodoroChannelId) {
    await handlePomodoroJoinPrompt(newState, userId, guildId, newChannel, config.pomodoroChannelId);
  }
}

async function handleJoinStudyChannel(userId, username, guildId, channelId) {
  await User.findOrCreate({
    where: { discordId: userId },
    defaults: { username },
  });

  const existingSession = await VoiceSession.findOne({
    where: {
      userDiscordId: userId,
      guildId,
      leftAt: null,
    },
  });

  if (existingSession) {
    existingSession.leftAt = new Date();
    existingSession.durationMinutes = Math.floor(
      (existingSession.leftAt - existingSession.joinedAt) / 60000
    );
    await existingSession.save();
  }

  await VoiceSession.create({
    userDiscordId: userId,
    guildId,
    channelId,
    joinedAt: new Date(),
  });
}

async function handleLeaveStudyChannel(userId, guildId) {
  const session = await VoiceSession.findOne({
    where: {
      userDiscordId: userId,
      guildId,
      leftAt: null,
    },
    order: [['joinedAt', 'DESC']],
  });

  if (session) {
    session.leftAt = new Date();
    session.durationMinutes = Math.floor(
      (session.leftAt - session.joinedAt) / 60000
    );
    await session.save();
  }
}

async function handlePomodoroJoinPrompt(newState, userId, guildId, voiceChannel, pomodoroChannelId) {
  // Ignore bots
  if (newState.member?.user?.bot) return;

  // Cooldown per user to avoid spam on rapid join/leave
  const cooldownKey = `${guildId}_${userId}`;
  if (pomodoroPromptCooldown.isOnCooldown(cooldownKey)) return;

  // Find an active pomodoro session tied to this voice channel
  const pomodoroSession = await PomodoroSession.findOne({
    where: { voiceChannelId: voiceChannel.id, isActive: true },
  });
  if (!pomodoroSession) return;

  // Don't prompt if user is already a participant
  if (pomodoroSession.participants.includes(userId)) return;

  pomodoroPromptCooldown.set(cooldownKey);

  try {
    const textChannel = await newState.guild.client.channels.fetch(pomodoroChannelId);
    if (!textChannel) return;

    const endsAtTimestamp = Math.floor(new Date(pomodoroSession.endsAt).getTime() / 1000);
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Pomodoro in Progress!')
      .setDescription(`<@${userId}> just joined <#${voiceChannel.id}>. There's an active pomodoro session here!\nEnds <t:${endsAtTimestamp}:R>`)
      .setTimestamp();

    const joinButton = new ButtonBuilder()
      .setCustomId(`pomodoro-join_${pomodoroSession.id}`)
      .setLabel('Join Session')
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(joinButton);
    const promptMsg = await textChannel.send({ content: `<@${userId}>`, embeds: [embed], components: [row] });
    joinPromptMessages.set(`${pomodoroSession.id}_${userId}`, promptMsg);
  } catch (err) {
    console.error('[Pomodoro] Failed to send join prompt:', err);
  }
}
