import {
  DataTypes,
  Sequelize,
  Model,
  InferAttributes,
  InferCreationAttributes,
  CreationOptional,
} from 'sequelize';

export interface SubmissionAttributes {
  id: number;
  problemUrl: string;
  problemSlug: string;
  problemTitle: string | null;
  guildId: string;
  userDiscordId: string;
}

export class Submission extends Model<
  InferAttributes<Submission>,
  InferCreationAttributes<Submission>
> {
  declare id: CreationOptional<number>;
  declare problemUrl: string;
  declare problemSlug: string;
  declare problemTitle: string | null;
  declare guildId: string;
  declare userDiscordId: string;
}

export default function defineSubmission(sequelize: Sequelize): typeof Submission {
  Submission.init(
    {
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
    },
    {
      sequelize,
      modelName: 'Submission',
    }
  );
  return Submission;
}
