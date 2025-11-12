// src/middlewares/auth.js
const { verifyAccess } = require('../utils/jwt');

/**
 * Middleware para proteger rotas com Bearer token.
 * Se o token estiver expirado, devolve 401 com code: 'TOKEN_EXPIRED'
 */
function protect(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ code: 'NO_TOKEN' });

    const payload = verifyAccess(token); // { id, role, ... }
    req.user = { id: payload.id, userId: payload.id, role: payload.role || 'user' };
    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ code: 'INVALID_TOKEN' });
  }
}

module.exports = { protect };
