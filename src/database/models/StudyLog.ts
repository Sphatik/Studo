import { DataTypes, Sequelize, Model, InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';

export interface StudyLogAttributes {
  id: number;
  userDiscordId: string;
  guildId: string;
  content: string;
  createdAt: Date;
}

export class StudyLog extends Model<InferAttributes<StudyLog>, InferCreationAttributes<StudyLog>> {
  declare id: CreationOptional<number>;
  declare userDiscordId: string;
  declare guildId: string;
  declare content: string;
  declare createdAt: CreationOptional<Date>;
}

export default function defineStudyLog(sequelize: Sequelize): typeof StudyLog {
  StudyLog.init({
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
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  }, {
    sequelize,
    modelName: 'StudyLog',
  });
  return StudyLog;
}
