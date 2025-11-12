const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { requireStripeConnectAccess } = require('../middlewares/stripeConnectAuth');
const stripePaymentController = require('../controllers/stripePaymentController');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.post(
  '/checkout-session',
  protect,
  requireStripeConnectAccess,
  wrap(stripePaymentController.createCheckoutSession),
);

router.get(
  '/',
  protect,
  requireStripeConnectAccess,
  wrap(stripePaymentController.getPayments),
);

router
  .route('/settings')
  .get(protect, requireStripeConnectAccess, wrap(stripePaymentController.getPaymentSettings))
  .patch(protect, requireStripeConnectAccess, wrap(stripePaymentController.updatePaymentSettings));

module.exports = router;
