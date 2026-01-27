import { User, VoiceSession, ServerConfig } from '../database/index.js';

export async function handleVoiceStateUpdate(oldState, newState) {
  const guildId = newState.guild?.id || oldState.guild?.id;
  if (!guildId) return;

  const config = await ServerConfig.findByPk(guildId);
  if (!config?.studyCategoryId) return;

  const userId = newState.member?.id || oldState.member?.id;
  const username = newState.member?.user?.username || oldState.member?.user?.username;
  if (!userId) return;

  const oldChannel = oldState.channel;
  const newChannel = newState.channel;

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
