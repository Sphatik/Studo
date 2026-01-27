import { DataTypes } from 'sequelize';

export default function defineServerConfig(sequelize) {
  return sequelize.define('ServerConfig', {
    guildId: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },
    trackingChannelId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    studyCategoryId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    studySummaryChannelId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  });
}
