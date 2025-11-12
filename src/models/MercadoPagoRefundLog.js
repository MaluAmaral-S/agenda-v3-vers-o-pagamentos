const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');
const Appointment = require('./Appointment');

const MercadoPagoRefundLog = sequelize.define(
  'MercadoPagoRefundLog',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    paymentId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    refundId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    appointmentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: Appointment, key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    businessId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: User, key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    requestAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    refundedAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    currency: {
      type: DataTypes.STRING(5),
      allowNull: false,
      defaultValue: 'BRL',
    },
    status: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    initiator: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    idempotencyKey: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    rawResponse: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    indexes: [
      { fields: ['paymentId'] },
      { fields: ['refundId'] },
      { fields: ['appointmentId'] },
      { fields: ['businessId'] },
    ],
  }
);

module.exports = MercadoPagoRefundLog;
