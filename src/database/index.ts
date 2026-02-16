import { Sequelize } from 'sequelize';
import BetterSqlite3 from 'better-sqlite3';
import defineUser, { User } from './models/User.js';
import defineSubmission, { Submission } from './models/Submission.js';
import defineServerConfig, { ServerConfig } from './models/ServerConfig.js';
import defineStudyLog, { StudyLog } from './models/StudyLog.js';
import defineVoiceSession, { VoiceSession } from './models/VoiceSession.js';
import definePomodoroSession, { PomodoroSession } from './models/PomodoroSession.js';
import definePomodoroCycle, { PomodoroCycle } from './models/PomodoroCycle.js';

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'database.sqlite',
  logging: false,
  dialectModule: BetterSqlite3,
});

// Initialize models
defineUser(sequelize);
defineSubmission(sequelize);
defineServerConfig(sequelize);
defineStudyLog(sequelize);
defineVoiceSession(sequelize);
definePomodoroSession(sequelize);
definePomodoroCycle(sequelize);

// Define associations
User.hasMany(Submission, { foreignKey: 'userDiscordId', sourceKey: 'discordId' });
Submission.belongsTo(User, { foreignKey: 'userDiscordId', targetKey: 'discordId' });

User.hasMany(StudyLog, { foreignKey: 'userDiscordId', sourceKey: 'discordId' });
StudyLog.belongsTo(User, { foreignKey: 'userDiscordId', targetKey: 'discordId' });

User.hasMany(VoiceSession, { foreignKey: 'userDiscordId', sourceKey: 'discordId' });
VoiceSession.belongsTo(User, { foreignKey: 'userDiscordId', targetKey: 'discordId' });

export {
  sequelize,
  User,
  Submission,
  ServerConfig,
  StudyLog,
  VoiceSession,
  PomodoroSession,
  PomodoroCycle,
};
