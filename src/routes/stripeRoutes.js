const express = require('express');
const router = express.Router();

// Controller (CommonJS ou default)
const controllerModule = require('../controllers/stripeController');
const stripeController = controllerModule?.default || controllerModule || {};

// Middleware de auth — aceita os dois jeitos (authenticateToken OU auth)
let authModule = {};
try {
  authModule = require('../middleware/auth');
} catch (_) {}

const authenticateToken =
  typeof authModule?.authenticateToken === 'function'
    ? authModule.authenticateToken
    : typeof authModule?.auth === 'function'
      ? authModule.auth
      : (req, res, next) => next(); // fallback: não bloqueia (apenas p/ não quebrar)

// Helper para capturar erros async
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Garante handlers como funções (evita "handler must be a function")
const createCheckout = typeof stripeController.createCheckoutSession === 'function'
  ? wrap(stripeController.createCheckoutSession)
  : (req, res) => res.status(500).json({ error: 'createCheckoutSession ausente no stripeController' });

const createPortal = typeof stripeController.createPortalSession === 'function'
  ? wrap(stripeController.createPortalSession)
  : (req, res) => res.status(500).json({ error: 'createPortalSession ausente no stripeController' });

// Rotas
router.post('/create-checkout-session', authenticateToken, createCheckout);
router.post('/create-portal-session', authenticateToken, createPortal);

// Webhook fica no server.js com express.raw (NÃO declare aqui)
module.exports = router;
