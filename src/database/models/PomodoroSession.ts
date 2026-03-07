import { DataTypes, Sequelize, Model, InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';

export interface PomodoroSessionAttributes {
  id: number;
  guildId: string;
  channelId: string;
  creatorId: string;
  participants: string[];
  duration: number;
  breakDuration: number;
  startedAt: Date;
  endsAt: Date;
  isActive: boolean;
  voiceChannelId: string | null;
}

export class PomodoroSession extends Model<InferAttributes<PomodoroSession>, InferCreationAttributes<PomodoroSession>> {
  declare id: CreationOptional<number>;
  declare guildId: string;
  declare channelId: string;
  declare creatorId: string;
  declare participants: string[];
  declare duration: CreationOptional<number>;
  declare breakDuration: CreationOptional<number>;
  declare startedAt: Date;
  declare endsAt: Date;
  declare isActive: CreationOptional<boolean>;
  declare voiceChannelId: string | null;
}

export default function definePomodoroSession(sequelize: Sequelize): typeof PomodoroSession {
  PomodoroSession.init({
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    guildId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    channelId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    creatorId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    participants: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '[]',
      get() {
        const value = this.getDataValue('participants') as unknown as string;
        return value ? JSON.parse(value) : [];
      },
      set(value: string[]) {
        this.setDataValue('participants', JSON.stringify(value) as unknown as string[]);
      },
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 25,
    },
    breakDuration: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    endsAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    voiceChannelId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  }, {
    sequelize,
    modelName: 'PomodoroSession',
  });
  return PomodoroSession;
}
