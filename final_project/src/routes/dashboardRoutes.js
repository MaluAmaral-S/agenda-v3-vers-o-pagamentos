// src/routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controllers/businessController');
const { protect } = require('../middlewares/auth'); // padronizado

// GET /api/dashboard/stats
router.get('/stats', protect, getDashboardStats);

module.exports = router;
