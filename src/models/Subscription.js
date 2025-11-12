const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Subscription = sequelize.define(
  'Subscription',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    planId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    // Datas mantidas para compatibilidade com a lógica anterior de simulação
    startsAt: { type: DataTypes.DATE, allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: true },

    // Status devolvido pelo Stripe (active, past_due, canceled, etc.)
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'pending',
    },
    paymentStatus: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'pending',
    },

    stripeSubscriptionId: { type: DataTypes.STRING, unique: true },
    stripeCustomerId: { type: DataTypes.STRING },
    stripePriceId: { type: DataTypes.STRING },
    currentPeriodEnd: { type: DataTypes.DATE },
    cancelAtPeriodEnd: { type: DataTypes.BOOLEAN, allowNull: true },
  },
  {
    indexes: [
      { fields: ['userId'] },
      { fields: ['status'] },
      { fields: ['paymentStatus'] },
      { fields: ['planId'] },
      { fields: ['stripeSubscriptionId'] },
      { fields: ['stripeCustomerId'] },
    ],
  }
);

module.exports = Subscription;
