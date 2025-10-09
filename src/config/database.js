// src/config/database.js
const { Sequelize } = require("sequelize");
const pg = require("pg");
const config = require("./config");

let sequelize;

// Use a separate in-memory SQLite database for the test environment
if (config.env === 'test') {
  sequelize = new Sequelize({
    dialect: "sqlite",
    storage: ":memory:",
    logging: false,
  });
} else {
  // Use PostgreSQL or MySQL for other environments (e.g., development, production)
  const dialect = config.database.dialect || "postgres";

  if (dialect === "postgres") {
    // This setting is specific to node-postgres (pg)
    pg.types.setTypeParser(1082, (val) => val); // Prevents timezone conversion issues

    sequelize = new Sequelize(config.database.name, config.database.user, config.database.password, {
      host: config.database.host,
      dialect: "postgres",
      port: config.database.port || 5432,
      logging: false,
    });
  } else if (dialect === "mysql") {
    sequelize = new Sequelize(config.database.name, config.database.user, config.database.password, {
      host: config.database.host,
      dialect: "mysql",
      port: config.database.port || 3306,
      logging: false,
    });
  } else {
    // Throw an error for unsupported dialects in development/production
    throw new Error(`Unsupported database dialect: ${dialect}`);
  }
}

module.exports = sequelize;