const express = require('express');
const router = express.Router();
const stripeConnectController = require('../controllers/stripeConnectController');
const { protect } = require('../middlewares/auth');
const { requireStripeConnectAccess } = require('../middlewares/stripeConnectAuth');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router
  .route('/account')
  .post(protect, requireStripeConnectAccess, wrap(stripeConnectController.createConnectAccount))
  .get(protect, requireStripeConnectAccess, wrap(stripeConnectController.getAccountStatus));

router.post(
  '/account/onboarding-link',
  protect,
  requireStripeConnectAccess,
  wrap(stripeConnectController.createOnboardingLink),
);

module.exports = router;
