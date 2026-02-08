import { DataTypes, Sequelize, Model, InferAttributes, InferCreationAttributes } from 'sequelize';

export interface ServerConfigAttributes {
  guildId: string;
  trackingChannelId: string | null;
  studyCategoryId: string | null;
  studySummaryChannelId: string | null;
}

export class ServerConfig extends Model<InferAttributes<ServerConfig>, InferCreationAttributes<ServerConfig>> {
  declare guildId: string;
  declare trackingChannelId: string | null;
  declare studyCategoryId: string | null;
  declare studySummaryChannelId: string | null;
}

export default function defineServerConfig(sequelize: Sequelize): typeof ServerConfig {
  ServerConfig.init({
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
  }, {
    sequelize,
    modelName: 'ServerConfig',
  });
  return ServerConfig;
}
