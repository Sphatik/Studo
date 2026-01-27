import { DataTypes } from 'sequelize';

export default function defineSubmission(sequelize) {
  return sequelize.define('Submission', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    problemUrl: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    problemSlug: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    problemTitle: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    guildId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    userDiscordId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  });
}
