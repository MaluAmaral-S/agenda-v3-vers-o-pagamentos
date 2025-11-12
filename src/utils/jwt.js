// src/utils/jwt.js
const jwt = require('jsonwebtoken');

function issueAccessToken(payload) {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN || '15m';
  if (!secret) throw new Error('JWT_SECRET ausente no .env');
  return jwt.sign(payload, secret, { expiresIn });
}

function issueRefreshToken(payload) {
  const secret = process.env.JWT_REFRESH_SECRET;
  const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '30d';
  if (!secret) throw new Error('JWT_REFRESH_SECRET ausente no .env');
  return jwt.sign(payload, secret, { expiresIn });
}

function verifyAccess(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

function verifyRefresh(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

module.exports = {
  issueAccessToken,
  issueRefreshToken,
  verifyAccess,
  verifyRefresh,
};
