// src/utils/password.js
const bcrypt = require('bcryptjs');
const SALT_ROUNDS = parseInt(process.env.PASSWORD_SALT_ROUNDS || '10', 10);
async function hashPassword(plain) { if (!plain) throw new Error('Senha em branco'); return await bcrypt.hash(plain, SALT_ROUNDS); }
async function verifyPassword(plain, hash) { if (!hash) return false; return await bcrypt.compare(plain, hash); }
module.exports = { hashPassword, verifyPassword };
