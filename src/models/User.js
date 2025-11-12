// src/models/User.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  businessName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  businessType: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  onboardingCompleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  passwordResetToken: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  passwordResetCode: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  passwordResetExpires: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  stripeAccountId: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: false,
  },
  stripeChargesEnabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  stripePayoutsEnabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  stripeDetailsSubmitted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  paymentsEnabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  mpUserId: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: false,
  },
  mpAccessToken: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  mpRefreshToken: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  mpTokenExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
});

function isBcryptHash(value) {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    bcrypt.getRounds(value);
    return true;
  } catch (_err) {
    return false;
  }
}

// Garante hashing em CREATE/UPDATE, mas evita reprocessar valores que já estão
// criptografados para não gerar hashes duplos.
User.beforeSave(async (user) => {
  if (!user.changed('password')) {
    return;
  }

  if (isBcryptHash(user.password)) {
    return;
  }

  const saltRounds = parseInt(process.env.PASSWORD_SALT_ROUNDS || '10', 10);
  const salt = await bcrypt.genSalt(saltRounds);
  user.password = await bcrypt.hash(user.password, salt);
});

module.exports = User;
