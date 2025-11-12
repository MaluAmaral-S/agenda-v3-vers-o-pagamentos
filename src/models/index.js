// CONTEÚDO COMPLETO PARA: src/models/index.js
const sequelize = require('../config/database');
const User = require('./User');
const Service = require('./Service');
const BusinessHours = require('./BusinessHours');
const Appointment = require('./Appointment');
const Plan = require('./Plan');
const Subscription = require('./Subscription');
const StripeEvent = require('./StripeEvent');
const Payment = require('./Payment');
const MercadoPagoWebhookEvent = require('./MercadoPagoWebhookEvent');
const MercadoPagoRefundLog = require('./MercadoPagoRefundLog');

// Definições de Relações
User.hasMany(Service, { foreignKey: 'userId' });
Service.belongsTo(User, { foreignKey: 'userId' });

User.hasOne(BusinessHours, { foreignKey: 'userId' });
BusinessHours.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Appointment, { foreignKey: 'userId' });
Appointment.belongsTo(User, { foreignKey: 'userId' });

Service.hasMany(Appointment, { foreignKey: 'serviceId' });
Appointment.belongsTo(Service, { foreignKey: 'serviceId' });

// --- ESTA É A CORREÇÃO FUNDAMENTAL ---
// Define que um Plano pode ter muitas Assinaturas e uma Assinatura pertence a um Plano.
Plan.hasMany(Subscription, { foreignKey: 'planId' });
Subscription.belongsTo(Plan, { as: 'plan', foreignKey: 'planId' });
// --- FIM DA CORREÇÃO FUNDAMENTAL ---

User.hasOne(Subscription, { foreignKey: 'userId' });
Subscription.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(StripeEvent, { foreignKey: 'userId', as: 'stripeEvents' });
StripeEvent.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(Payment, { foreignKey: 'businessId', as: 'payments' });
Payment.belongsTo(User, { foreignKey: 'businessId', as: 'business' });
User.hasMany(Payment, { foreignKey: 'createdByUserId', as: 'createdPayments' });
Payment.belongsTo(User, { foreignKey: 'createdByUserId', as: 'creator' });
User.hasMany(MercadoPagoWebhookEvent, { foreignKey: 'businessId', as: 'mercadoPagoWebhookEvents' });
MercadoPagoWebhookEvent.belongsTo(User, { foreignKey: 'businessId', as: 'business' });
Appointment.hasMany(MercadoPagoRefundLog, { foreignKey: 'appointmentId', as: 'refundLogs' });
MercadoPagoRefundLog.belongsTo(Appointment, { foreignKey: 'appointmentId', as: 'appointment' });
User.hasMany(MercadoPagoRefundLog, { foreignKey: 'businessId', as: 'mercadoPagoRefundLogs' });
MercadoPagoRefundLog.belongsTo(User, { foreignKey: 'businessId', as: 'business' });

module.exports = {
  sequelize,
  User,
  Service,
  BusinessHours,
  Appointment,
  Plan,
  Subscription,
  StripeEvent,
  Payment,
  MercadoPagoWebhookEvent,
  MercadoPagoRefundLog,
};
