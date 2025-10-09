// src/config/database.js
const { Sequelize } = require("sequelize");
const pg = require("pg");
const config = require("./config");

// Forçar o node-postgres a retornar o tipo DATE como string em vez de objeto Date.
// Isso evita problemas de conversão de fuso horário. OID 1082 é o código para o tipo DATE.
// Apenas se aplica a PostgreSQL, então será condicional.
if (config.database.dialect === 'postgres') {
  pg.types.setTypeParser(1082, (val) => val);
}

const dialect = config.database.dialect || "postgres";

let sequelize;

if (dialect === "sqlite") {
  sequelize = new Sequelize({
    dialect: "sqlite",
    // Use in-memory database for tests to avoid file system permissions issues.
    storage: ":memory:",
    logging: false,
  });
} else if (dialect === "mysql") {
  sequelize = new Sequelize(config.database.name, config.database.user, config.database.password, {
    host: config.database.host,
    dialect: "mysql",
    port: config.database.port || 3306, // Porta padrão do MySQL
    logging: false,
  });
} else {
  // Default para PostgreSQL
  sequelize = new Sequelize(config.database.name, config.database.user, config.database.password, {
    host: config.database.host,
    dialect: "postgres",
    port: config.database.port || 5432, // Porta padrão do PostgreSQL
    logging: false,
  });
}

module.exports = sequelize;