const express = require('express');
const { protect } = require('../controllers/authController');
const {
  createSubscription,
  getMySubscription,
} = require('../controllers/subscriptionController');

const router = express.Router();

// As rotas de assinatura agora usam o middleware 'protect'
router.post('/', protect, createSubscription);
router.get('/me', protect, getMySubscription);

module.exports = router;