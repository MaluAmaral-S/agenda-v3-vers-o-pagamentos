/* eslint-disable no-console */
/**
 * Migration para adicionar campos de integração com Mercado Pago nas tabelas
 * Users (empresas) e Appointments (agendamentos), além da nova tabela de logs
 * de webhooks.
 *
 * Execute com:
 *   node src/scripts/migrations/20250115_add_mercado_pago_columns.js
 *
 * A migration é idempotente – verifica a existência das colunas/tabela antes de criar.
 */

require('dotenv').config();

const { DataTypes, Sequelize } = require('sequelize');
const sequelize = require('../../config/database');

async function columnExists(queryInterface, tableName, columnName) {
  const tableInfo = await queryInterface.describeTable(tableName);
  return Boolean(tableInfo[columnName]);
}

async function up() {
  const queryInterface = sequelize.getQueryInterface();
  console.log('[migration] Iniciando atualização Mercado Pago...');

  await sequelize.authenticate();
  console.log('[migration] Conexão estabelecida.');

  // -------- Users --------
  if (!(await columnExists(queryInterface, 'Users', 'mpUserId'))) {
    await queryInterface.addColumn('Users', 'mpUserId', {
      type: DataTypes.STRING,
      allowNull: true,
    });
    console.log('[migration] Coluna Users.mpUserId criada.');
  }

  if (!(await columnExists(queryInterface, 'Users', 'mpAccessToken'))) {
    await queryInterface.addColumn('Users', 'mpAccessToken', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
    console.log('[migration] Coluna Users.mpAccessToken criada.');
  }

  if (!(await columnExists(queryInterface, 'Users', 'mpRefreshToken'))) {
    await queryInterface.addColumn('Users', 'mpRefreshToken', {
      type: DataTypes.TEXT,
      allowNull: true,
    });
    console.log('[migration] Coluna Users.mpRefreshToken criada.');
  }

  if (!(await columnExists(queryInterface, 'Users', 'mpTokenExpiresAt'))) {
    await queryInterface.addColumn('Users', 'mpTokenExpiresAt', {
      type: DataTypes.DATE,
      allowNull: true,
    });
    console.log('[migration] Coluna Users.mpTokenExpiresAt criada.');
  }

  // -------- Appointments --------
  if (!(await columnExists(queryInterface, 'Appointments', 'mpPreferenceId'))) {
    await queryInterface.addColumn('Appointments', 'mpPreferenceId', {
      type: DataTypes.STRING,
      allowNull: true,
    });
    console.log('[migration] Coluna Appointments.mpPreferenceId criada.');
  }

  if (!(await columnExists(queryInterface, 'Appointments', 'mpPaymentId'))) {
    await queryInterface.addColumn('Appointments', 'mpPaymentId', {
      type: DataTypes.STRING,
      allowNull: true,
    });
    console.log('[migration] Coluna Appointments.mpPaymentId criada.');
  }

  if (!(await columnExists(queryInterface, 'Appointments', 'mpExternalReference'))) {
    await queryInterface.addColumn('Appointments', 'mpExternalReference', {
      type: DataTypes.STRING,
      allowNull: true,
    });
    console.log('[migration] Coluna Appointments.mpExternalReference criada.');
  }

  if (!(await columnExists(queryInterface, 'Appointments', 'amount'))) {
    await queryInterface.addColumn('Appointments', 'amount', {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    });
    console.log('[migration] Coluna Appointments.amount criada.');
  }

  if (!(await columnExists(queryInterface, 'Appointments', 'currency'))) {
    await queryInterface.addColumn('Appointments', 'currency', {
      type: DataTypes.STRING(5),
      allowNull: false,
      defaultValue: 'BRL',
    });
    console.log('[migration] Coluna Appointments.currency criada.');
  }

  if (!(await columnExists(queryInterface, 'Appointments', 'paymentStatus'))) {
    await queryInterface.addColumn('Appointments', 'paymentStatus', {
      type: DataTypes.ENUM(
        'not_required',
        'pending',
        'in_process',
        'paid',
        'partially_refunded',
        'refunded',
        'cancelled',
        'failed',
      ),
      allowNull: false,
      defaultValue: 'pending',
    });
    console.log('[migration] Coluna Appointments.paymentStatus criada.');
  }

  // -------- MercadoPagoWebhookEvents --------
  const tables = await queryInterface.showAllTables();
  const hasWebhookTable = tables
    .map((name) => (typeof name === 'object' ? name.tableName : name))
    .some((name) => name === 'MercadoPagoWebhookEvents');

  if (!hasWebhookTable) {
    const payloadColumnType =
      queryInterface.sequelize.getDialect && queryInterface.sequelize.getDialect() === 'postgres'
        ? DataTypes.JSONB
        : DataTypes.JSON;

    await queryInterface.createTable('MercadoPagoWebhookEvents', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      notificationId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
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
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      payload: {
        type: payloadColumnType,
        allowNull: true,
      },
      errorMessage: {
        type: DataTypes.TEXT,
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
    await queryInterface.addIndex('MercadoPagoWebhookEvents', ['dataId']);
    await queryInterface.addIndex('MercadoPagoWebhookEvents', ['businessId']);
    await queryInterface.addIndex('MercadoPagoWebhookEvents', ['status']);
    console.log('[migration] Tabela MercadoPagoWebhookEvents criada.');
  }

  console.log('[migration] Atualização Mercado Pago concluída com sucesso.');
  await sequelize.close();
}

up().catch(async (error) => {
  console.error('[migration] Falha ao executar migration Mercado Pago:', error);
  await sequelize.close();
  process.exit(1);
});
