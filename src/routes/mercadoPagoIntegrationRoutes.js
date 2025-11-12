const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { requireMarketplaceAccess } = require('../middlewares/marketplaceAccess');
const controller = require('../controllers/mercadoPagoIntegrationController');

const guard = [protect, requireMarketplaceAccess];

router.get('/connect', guard, controller.getConnectUrl);
router.post('/connect', guard, controller.getConnectUrl);
router.get('/status', guard, controller.getStatus);
module.exports = router;
