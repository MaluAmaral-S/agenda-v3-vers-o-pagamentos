const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MercadoPagoWebhookEvent = sequelize.define(
  'MercadoPagoWebhookEvent',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    notificationId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    topic: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    eventType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dataId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'received',
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    businessId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    indexes: [
      { unique: true, fields: ['notificationId'] },
      { fields: ['dataId'] },
      { fields: ['businessId'] },
      { fields: ['status'] },
    ],
  },
);

module.exports = MercadoPagoWebhookEvent;
