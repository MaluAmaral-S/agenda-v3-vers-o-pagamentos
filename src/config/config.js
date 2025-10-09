require('dotenv').config();

const config = {
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  database: {
    dialect: process.env.DB_DIALECT,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    name: process.env.DB_NAME,
  },
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,
};

// Validação das variáveis de ambiente essenciais
if (!config.jwt.secret || !config.jwt.refreshSecret) {
  console.error("ERRO FATAL: As variáveis de ambiente JWT_SECRET e JWT_REFRESH_SECRET são obrigatórias.");
  process.exit(1);
}

module.exports = config;