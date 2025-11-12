// scripts/dbSync.js
// Cria/atualiza tabelas a partir dos Models do Sequelize.
// Usa DB_SYNC=alter (padrão) para criar o que faltar sem perder dados.
// Use DB_SYNC=force para dropar e recriar (⚠️ apaga os dados).

require('dotenv').config();

// Ajuste o caminho abaixo se seu arquivo de models ficar em outro lugar:
const models = require('../src/models');
const sequelize = models.sequelize || models.default?.sequelize || models.db || null;

if (!sequelize) {
  console.error('[dbSync] Não consegui obter a instância do Sequelize de ../src/models');
  process.exit(1);
}

(async () => {
  const mode = (process.env.DB_SYNC || 'alter').toLowerCase();
  const isForce = mode === 'force';
  const isAlter = mode === 'alter' || mode === '';

  try {
    console.log('[dbSync] Autenticando no banco...');
    await sequelize.authenticate();
    console.log('[dbSync] OK!');

    console.log(`[dbSync] Sincronizando models -> tabelas (mode=${mode}) ...`);
    if (isForce) {
      await sequelize.sync({ force: true });
    } else if (isAlter) {
      await sequelize.sync({ alter: true });
    } else {
      await sequelize.sync();
    }
    console.log('[dbSync] Sincronização concluída com sucesso.');
    process.exit(0);
  } catch (err) {
    console.error('[dbSync] Falha na sincronização:', err);
    process.exit(2);
  }
})();
