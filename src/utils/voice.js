import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
} from '@discordjs/voice';
import googleTTS from 'google-tts-api';
import { Readable } from 'stream';
import https from 'https';

// Store active voice connections by guildId
const voiceConnections = new Map();

export async function joinVC(channel) {
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    voiceConnections.set(channel.guild.id, connection);
    return connection;
  } catch (error) {
    connection.destroy();
    throw error;
  }
}

export function leaveVC(guildId) {
  const connection = voiceConnections.get(guildId) || getVoiceConnection(guildId);
  if (connection) {
    connection.destroy();
    voiceConnections.delete(guildId);
  }
}

export function getConnection(guildId) {
  return voiceConnections.get(guildId) || getVoiceConnection(guildId);
}

async function fetchAudioBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

export async function speakTTS(guildId, text, leaveAfter = false) {
  const connection = getConnection(guildId);
  if (!connection) {
    console.log('No voice connection for guild:', guildId);
    return false;
  }

  try {
    const url = googleTTS.getAudioUrl(text, {
      lang: 'en',
      slow: false,
      host: 'https://translate.google.com',
    });

    const audioBuffer = await fetchAudioBuffer(url);
    const stream = Readable.from(audioBuffer);
    const resource = createAudioResource(stream);
    const player = createAudioPlayer();

    connection.subscribe(player);
    player.play(resource);

    return new Promise((resolve, reject) => {
      player.on(AudioPlayerStatus.Idle, () => {
        if (leaveAfter) {
          leaveVC(guildId);
        }
        resolve(true);
      });

      player.on('error', error => {
        console.error('Audio player error:', error);
        if (leaveAfter) {
          leaveVC(guildId);
        }
        reject(error);
      });
    });
  } catch (error) {
    console.error('TTS error:', error);
    return false;
  }
}

export async function playPomodoroComplete(guildId) {
  return speakTTS(guildId, 'Pomodoro complete! Great work. Time for a break.');
}

export async function playBreakComplete(guildId) {
  return speakTTS(guildId, 'Break is over! Ready for another pomodoro?');
}

export async function playPomodoroStart(guildId) {
  return speakTTS(guildId, 'Pomodoro started. Focus time!');
}
