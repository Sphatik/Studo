import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  VoiceConnection,
} from '@discordjs/voice';
import googleTTS from 'google-tts-api';
import { Readable } from 'stream';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { VoiceChannel } from 'discord.js';

const voiceConnections = new Map<string, VoiceConnection>();

const TTS_CACHE_DIR = path.resolve('tts_cache');
// Lookup table: text -> absolute file path
const ttsCache = new Map<string, string>();

function textToFilename(text: string): string {
  // Sanitize text to a safe filename using a hash-like approach
  const safe = text.replace(/[^a-z0-9]/gi, '_').slice(0, 50);
  const hash = text.split('').reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, 0);
  return `${safe}_${hash}.mp3`;
}

export function loadTTSCache() {
  if (!fs.existsSync(TTS_CACHE_DIR)) {
    fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });
    return;
  }
  const files = fs.readdirSync(TTS_CACHE_DIR).filter(f => f.endsWith('.mp3'));
  for (const file of files) {
    ttsCache.set(file, path.join(TTS_CACHE_DIR, file));
  }
  console.log(`[TTS] Loaded ${ttsCache.size} cached audio files.`);
}

export async function joinVC(channel: VoiceChannel) {
    const connection = joinVoiceChannel({
        channelId: channel.id, 
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator});
    try {
        await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
        voiceConnections.set(channel.guild.id, connection);
    } catch (err) {
        connection.destroy();
        voiceConnections.delete(channel.guild.id);
        throw err;
    }
}

export function leaveVC(guildId: string) {
  const connection = voiceConnections.get(guildId) || getVoiceConnection(guildId);
  if (connection) {
    connection.destroy();
    voiceConnections.delete(guildId);
  }
}

export function getConnection(guildId: string) {
  return voiceConnections.get(guildId) || getVoiceConnection(guildId);
}

export async function speakTTSCached(channel: VoiceChannel, text: string): Promise<void> {
  let connection = getConnection(channel.guild.id);
  if (!connection) {
    await joinVC(channel);
    connection = getConnection(channel.guild.id)!;
  } else if (connection.joinConfig.channelId !== channel.id) {
    await joinVC(channel);
    connection = getConnection(channel.guild.id)!;
  }

  const filename = textToFilename(text);
  let filePath = ttsCache.get(filename);

  if (!filePath) {
    filePath = path.join(TTS_CACHE_DIR, filename);
    await downloadTTSFile(text, filePath);
    ttsCache.set(filename, filePath);
  }

  const player = createAudioPlayer();
  const resource = createAudioResource(filePath);
  connection.subscribe(player);
  player.play(resource);

  await entersState(player, AudioPlayerStatus.Idle, 60_000);
}


async function downloadTTSFile(text: string, filePath: string): Promise<void> {
  const url = googleTTS.getAudioUrl(text, { lang: 'en', slow: false, host: 'https://translate.google.com' });
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);
    https.get(url, (res) => {
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      fs.unlink(filePath, () => {});
      reject(err);
    });
  });
}