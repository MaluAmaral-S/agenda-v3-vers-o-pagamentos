const express = require('express');
const router = express.Router();
const stripeController = require('../controllers/stripeController');
const { protect } = require('../middlewares/auth');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.post('/create-checkout-session', protect, wrap(stripeController.createCheckoutSession));
router.post('/create-portal-session', protect, wrap(stripeController.createPortalSession));

// Webhook permanece configurado diretamente no server.js usando express.raw
module.exports = router;
