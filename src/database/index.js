import { Sequelize } from 'sequelize';
import defineUser from './models/User.js';
import defineSubmission from './models/Submission.js';
import defineServerConfig from './models/ServerConfig.js';
import defineStudyLog from './models/StudyLog.js';
import defineVoiceSession from './models/VoiceSession.js';

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'database.sqlite',
  logging: false,
});

// Initialize models
const User = defineUser(sequelize);
const Submission = defineSubmission(sequelize);
const ServerConfig = defineServerConfig(sequelize);
const StudyLog = defineStudyLog(sequelize);
const VoiceSession = defineVoiceSession(sequelize);

// Define associations
User.hasMany(Submission, { foreignKey: 'userDiscordId', sourceKey: 'discordId' });
Submission.belongsTo(User, { foreignKey: 'userDiscordId', targetKey: 'discordId' });

User.hasMany(StudyLog, { foreignKey: 'userDiscordId', sourceKey: 'discordId' });
StudyLog.belongsTo(User, { foreignKey: 'userDiscordId', targetKey: 'discordId' });

User.hasMany(VoiceSession, { foreignKey: 'userDiscordId', sourceKey: 'discordId' });
VoiceSession.belongsTo(User, { foreignKey: 'userDiscordId', targetKey: 'discordId' });

export { sequelize, User, Submission, ServerConfig, StudyLog, VoiceSession };
