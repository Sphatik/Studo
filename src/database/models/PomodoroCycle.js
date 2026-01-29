import { DataTypes } from 'sequelize';

export default function definePomodoroCycle(sequelize) {
  return sequelize.define('PomodoroCycle', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    userDiscordId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    guildId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    sessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  });
}
