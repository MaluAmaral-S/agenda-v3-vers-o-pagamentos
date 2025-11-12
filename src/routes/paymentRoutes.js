const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { requireMarketplaceAccess } = require('../middlewares/marketplaceAccess');
const controller = require('../controllers/mercadoPagoPaymentController');

router.post('/checkout-pro', controller.startCheckoutPro);

router.post('/:paymentId/refunds', protect, requireMarketplaceAccess, controller.createRefund);
router.get('/:paymentId/refunds', protect, requireMarketplaceAccess, controller.listRefunds);

module.exports = router;
