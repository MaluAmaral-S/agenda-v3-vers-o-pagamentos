const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');
const Payment = sequelize.define('Payment', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  businessId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: User, key: 'id' },
  },
  createdByUserId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: User, key: 'id' },
  },
  customerName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  customerEmail: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: { isEmail: true },
  },
  customerPhone: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  amount: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  currency: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'brl',
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'pending',
  },
  failureReason: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  stripeCheckoutSessionId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  stripePaymentIntentId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  stripeCustomerId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  requestedPaymentMethods: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  appliedPaymentMethods: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  lastStripeErrorCode: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
}, {
  indexes: [
    { fields: ['businessId'] },
    { fields: ['createdByUserId'] },
    { fields: ['status'] },
    { fields: ['stripeCheckoutSessionId'] },
    { fields: ['stripePaymentIntentId'] },
    { fields: ['stripeCustomerId'] },
    { fields: ['requestedPaymentMethods'] },
    { fields: ['appliedPaymentMethods'] },
  ],
});

module.exports = Payment;
