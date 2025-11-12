const express = require('express');
const router = express.Router();
const stripeController = require('../controllers/stripeController');
const { protect } = require('../middlewares/auth');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.post('/create-checkout-session', protect, wrap(stripeController.createCheckoutSession));
router.post('/confirm-subscription', protect, wrap(stripeController.confirmSubscriptionCheckout));
router.post('/create-portal-session', protect, wrap(stripeController.createPortalSession));
router.post('/cancel-subscription', protect, wrap(stripeController.cancelSubscription));

// Webhook permanece configurado diretamente no server.js usando express.raw
module.exports = router;
