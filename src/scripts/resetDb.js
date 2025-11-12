/**
 * Script de reset seguro do esquema (DERRUBA e recria as tabelas).
 * Use quando quiser limpar o banco sem precisar dropar o database.
 * 
 * EXECUÇÃO:
 *   node src/scripts/resetDb.js
 */
require('dotenv').config();
const { sequelize } = require('../models');

(async () => {
  try {
    console.log('🔄 Resetando tabelas via Sequelize...');
    await sequelize.drop();
    await sequelize.sync({ force: true });
    console.log('✅ Tabelas recriadas.');
    // Reaproveita seu seed de planos, se existir:
    try {
      const seedPlans = require('../scripts/seedPlans');
      if (typeof seedPlans === 'function') {
        await seedPlans();
        console.log('🌱 Planos seed executado.');
      }
    } catch (e) {
      console.log('ℹ️ Seed de planos não encontrado/execução ignorada.');
    }
    process.exit(0);
  } catch (e) {
    console.error('❌ Falha ao resetar banco:', e);
    process.exit(1);
  }
})();
