/* eslint-disable no-console */
/**
 * Migration para criar a tabela MercadoPagoRefundLogs utilizada para registrar
 * reembolsos iniciados via API oficial do Mercado Pago.
 *
 * Execute com:
 *   node src/scripts/migrations/20250118_add_mercado_pago_refund_logs.js
 *
 * A migration é idempotente.
 */

require('dotenv').config();

const { DataTypes, Sequelize } = require('sequelize');
const sequelize = require('../../config/database');

async function tableExists(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables
    .map((name) => (typeof name === 'object' ? name.tableName : name))
    .some((name) => name === tableName);
}

async function up() {
  const queryInterface = sequelize.getQueryInterface();
  console.log('[migration] Criando tabela MercadoPagoRefundLogs (se necessário)...');

  await sequelize.authenticate();
  console.log('[migration] Conexão estabelecida.');

  if (await tableExists(queryInterface, 'MercadoPagoRefundLogs')) {
    console.log('[migration] Tabela MercadoPagoRefundLogs já existe. Nada a fazer.');
    await sequelize.close();
    return;
  }

  const payloadColumnType =
    queryInterface.sequelize.getDialect && queryInterface.sequelize.getDialect() === 'postgres'
      ? DataTypes.JSONB
      : DataTypes.JSON;

  await queryInterface.createTable('MercadoPagoRefundLogs', {
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
      unique: false,
    },
    appointmentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Appointments', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    businessId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Users', key: 'id' },
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
      type: payloadColumnType,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
  });

  await queryInterface.addIndex('MercadoPagoRefundLogs', ['paymentId']);
  await queryInterface.addIndex('MercadoPagoRefundLogs', ['refundId']);
  await queryInterface.addIndex('MercadoPagoRefundLogs', ['appointmentId']);
  await queryInterface.addIndex('MercadoPagoRefundLogs', ['businessId']);

  console.log('[migration] Tabela MercadoPagoRefundLogs criada com sucesso.');
  await sequelize.close();
}

up().catch((error) => {
  console.error('[migration] Falha ao criar tabela MercadoPagoRefundLogs:', error);
  process.exit(1);
});
