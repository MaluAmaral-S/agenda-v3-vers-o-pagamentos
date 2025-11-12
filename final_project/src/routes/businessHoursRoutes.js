// src/routes/businessHoursRoutes.js
const express = require('express');
const router = express.Router();
const businessHoursController = require('../controllers/businessHoursController');
const { protect } = require('../middlewares/auth'); // padronizado

// Todas as rotas são protegidas
router.use(protect);

router.route('/')
  .get(businessHoursController.getBusinessHours)
  .post(businessHoursController.saveBusinessHours);

module.exports = router;
