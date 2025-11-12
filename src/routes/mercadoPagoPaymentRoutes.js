const express = require('express');
const { protect } = require('../middlewares/auth');
const { requireMarketplaceAccess } = require('../middlewares/marketplaceAccess');
const controller = require('../controllers/mercadoPagoPaymentController');

const router = express.Router();

function registerMercadoPagoRoutes(targetRouter) {
  targetRouter.get('/', protect, requireMarketplaceAccess, controller.listRecentPayments);

  targetRouter
    .route('/settings')
    .get(protect, requireMarketplaceAccess, controller.getSettings)
    .patch(protect, requireMarketplaceAccess, controller.updateSettings);

  // Checkout Pro permanece acessível via /api/payments/checkout-pro.
  targetRouter.post('/checkout-pro', controller.startCheckoutPro);
}

// Rotas canônicas (/api/payments/...)
registerMercadoPagoRoutes(router);

// Alias legados (/api/payments/mercadopago/...) para compatibilidade com o frontend
const legacyRouter = express.Router();
registerMercadoPagoRoutes(legacyRouter);
router.use('/mercadopago', legacyRouter);

module.exports = router;
