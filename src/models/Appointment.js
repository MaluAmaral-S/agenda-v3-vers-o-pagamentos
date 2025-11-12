// src/models/Appointment.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');
const Service = require('./Service');

const Appointment = sequelize.define('Appointment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: User, key: 'id' }
  },
  serviceId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: Service, key: 'id' }
  },
  clientName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  clientEmail: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isEmail: true,
    },
  },
  clientPhone: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  appointmentDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  appointmentTime: {
    type: DataTypes.TIME,
    allowNull: false,
  },
  endTime: {
    type: DataTypes.TIME,
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'rejected', 'rescheduled', 'canceled'),
    allowNull: false,
    defaultValue: 'pending'
  },
  observations: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // Campos para reagendamento
  suggestedDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  suggestedTime: {
    type: DataTypes.TIME,
    allowNull: true,
  },
  suggestedEndTime: {
    type: DataTypes.TIME,
    allowNull: true,
  },
  rejectionReason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  paymentIntentId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  mpPreferenceId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  mpPaymentId: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  mpExternalReference: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  currency: {
    type: DataTypes.STRING(5),
    allowNull: false,
    defaultValue: 'BRL',
  },
  paymentStatus: {
    type: DataTypes.ENUM('not_required', 'pending', 'in_process', 'paid', 'partially_refunded', 'refunded', 'cancelled', 'failed'),
    allowNull: false,
    defaultValue: 'pending',
  },
  statusPagamento: {
    type: DataTypes.ENUM('pendente', 'pago', 'reembolsado'),
    allowNull: false,
    defaultValue: 'pendente',
  },
  valorPago: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  }
}, { 
  timestamps: true,
  indexes: [
    {
      fields: ['userId', 'appointmentDate', 'appointmentTime']
    },
    {
      fields: ['status']
    },
    {
      fields: ['paymentIntentId']
    },
    {
      fields: ['mpPreferenceId']
    },
    {
      fields: ['mpPaymentId']
    },
    {
      fields: ['mpExternalReference']
    },
    {
      fields: ['paymentStatus']
    },
    {
      fields: ['statusPagamento']
    }
  ]
});

// Definindo as relações
Appointment.belongsTo(User, {
  foreignKey: 'userId',
  as: 'business'
});

Appointment.belongsTo(Service, {
  foreignKey: 'serviceId',
  as: 'service'
});

User.hasMany(Appointment, {
  foreignKey: 'userId',
  as: 'appointments'
});

Service.hasMany(Appointment, {
  foreignKey: 'serviceId',
  as: 'appointments'
});

module.exports = Appointment;
