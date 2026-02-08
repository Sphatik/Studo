import { DataTypes, Sequelize, Model, InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';

export interface VoiceSessionAttributes {
  id: number;
  userDiscordId: string;
  guildId: string;
  channelId: string;
  joinedAt: Date;
  leftAt: Date | null;
  durationMinutes: number | null;
}

export class VoiceSession extends Model<InferAttributes<VoiceSession>, InferCreationAttributes<VoiceSession>> {
  declare id: CreationOptional<number>;
  declare userDiscordId: string;
  declare guildId: string;
  declare channelId: string;
  declare joinedAt: Date;
  declare leftAt: Date | null;
  declare durationMinutes: number | null;
}

export default function defineVoiceSession(sequelize: Sequelize): typeof VoiceSession {
  VoiceSession.init({
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
    channelId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    joinedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    leftAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    durationMinutes: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  }, {
    sequelize,
    modelName: 'VoiceSession',
  });
  return VoiceSession;
}
