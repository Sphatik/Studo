import {
  DataTypes,
  Sequelize,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from 'sequelize';

export interface UserAttributes {
  discordId: string;
  username: string;
  totalSolved: number;
}

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare discordId: string;
  declare username: string;
  declare totalSolved: CreationOptional<number>;
}

export default function defineUser(sequelize: Sequelize): typeof User {
  User.init(
    {
      discordId: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
      },
      username: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      totalSolved: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
    },
    {
      sequelize,
      modelName: 'User',
    }
  );
  return User;
}
