import { PomodoroSession, PomodoroCycle } from '../../database/index.js';


export default async function getChannelPomodoro(channelId, voiceChannel) {
    const existingSession = await PomodoroSession.findOne({
        where: {
            channelId,
            isActive: true,
        }
    })
    if (existingSession) return existingSession;
    if (voiceChannel == null) return null;
    const voiceSession = await PomodoroSession.findOne({
        where: {
            voiceChannelId: voiceChannel,
            isActive: true
        }
    });
    if (voiceSession) return voiceSession;
    return null;
}