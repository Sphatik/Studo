import { DataTypes, Sequelize, Model, InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';

export interface PomodoroCycleAttributes {
  id: number;
  userDiscordId: string;
  guildId: string;
  duration: number;
  sessionId: number;
}

export class PomodoroCycle extends Model<InferAttributes<PomodoroCycle>, InferCreationAttributes<PomodoroCycle>> {
  declare id: CreationOptional<number>;
  declare userDiscordId: string;
  declare guildId: string;
  declare duration: number;
  declare sessionId: number;
}

export default function definePomodoroCycle(sequelize: Sequelize): typeof PomodoroCycle {
  PomodoroCycle.init({
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
  }, {
    sequelize,
    modelName: 'PomodoroCycle',
  });
  return PomodoroCycle;
}
