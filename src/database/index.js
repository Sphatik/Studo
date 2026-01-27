import { Sequelize } from 'sequelize';
import defineUser from './models/User.js';
import defineSubmission from './models/Submission.js';
import defineServerConfig from './models/ServerConfig.js';

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: 'database.sqlite',
  logging: false,
});

// Initialize models
const User = defineUser(sequelize);
const Submission = defineSubmission(sequelize);
const ServerConfig = defineServerConfig(sequelize);

// Define associations
User.hasMany(Submission, { foreignKey: 'userDiscordId', sourceKey: 'discordId' });
Submission.belongsTo(User, { foreignKey: 'userDiscordId', targetKey: 'discordId' });

export { sequelize, User, Submission, ServerConfig };
