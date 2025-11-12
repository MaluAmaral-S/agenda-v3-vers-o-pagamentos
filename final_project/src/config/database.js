// src/config/database.js
require("dotenv").config();
const { Sequelize } = require("sequelize");
const pg = require("pg");

// Forçar o node-postgres a retornar o tipo DATE como string em vez de objeto Date.
// Isso evita problemas de conversão de fuso horário. OID 1082 é o código para o tipo DATE.
// Apenas se aplica a PostgreSQL, então será condicional.
if (process.env.DB_DIALECT === 'postgres') {
  pg.types.setTypeParser(1082, (val) => val);
}

// Configuração para SQLite (para testes), PostgreSQL ou MySQL (para produção)
const dialect = process.env.DB_DIALECT || "postgres";

let sequelize;

if (dialect === "sqlite") {
  sequelize = new Sequelize({
    dialect: "sqlite",
    storage: process.env.DB_NAME || "agendamentos_db.sqlite",
    logging: false,
  });
} else if (dialect === "mysql") {
  sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    dialect: "mysql",
    port: process.env.DB_PORT || 3306, // Porta padrão do MySQL
    logging: false,
  });
} else {
  // Default para PostgreSQL
  sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    dialect: "postgres",
    port: process.env.DB_PORT || 5432, // Porta padrão do PostgreSQL
    logging: false,
  });
}

module.exports = sequelize;

