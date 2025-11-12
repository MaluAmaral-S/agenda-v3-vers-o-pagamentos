const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const payloadType = sequelize.getDialect() === 'postgres' ? DataTypes.JSONB : DataTypes.JSON;

const StripeEvent = sequelize.define('StripeEvent', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  eventId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'received',
  },
  requestId: {
    type: DataTypes.STRING,
  },
  livemode: {
    type: DataTypes.BOOLEAN,
  },
  userId: {
    type: DataTypes.INTEGER,
  },
  stripeCustomerId: {
    type: DataTypes.STRING,
  },
  stripeSubscriptionId: {
    type: DataTypes.STRING,
  },
  paymentStatus: {
    type: DataTypes.STRING,
  },
  processedAt: {
    type: DataTypes.DATE,
  },
  errorMessage: {
    type: DataTypes.TEXT,
  },
  payload: {
    type: payloadType,
  },
}, {
  indexes: [
    { unique: true, fields: ['eventId'] },
    { fields: ['type'] },
    { fields: ['status'] },
    { fields: ['userId'] },
    { fields: ['stripeSubscriptionId'] },
    { fields: ['paymentStatus'] },
  ],
});

module.exports = StripeEvent;

