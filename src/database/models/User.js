import { DataTypes } from 'sequelize';

export default function defineUser(sequelize) {
  return sequelize.define('User', {
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
  });
}
