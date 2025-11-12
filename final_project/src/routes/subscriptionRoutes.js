// src/routes/subscriptionRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth'); // padronizado
const {
  createSubscription,
  getMySubscription,
  getSubscription,
} = require('../controllers/subscriptionController');

router.post('/subscriptions', protect, createSubscription);
router.get('/subscriptions/me', protect, getMySubscription);
router.get('/subscriptions', protect, getSubscription);

module.exports = router;
