// src/routes/authRoutes.js
const router = require('express').Router();
const ctrl = require('../controllers/authController');
const { protect } = require('../middlewares/auth');

router.post('/register', ctrl.register);
router.post('/login', ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/logout', ctrl.logout);
router.post('/forgot-password', ctrl.forgotPassword);
router.post('/verify-code', ctrl.verifyResetCode);
router.post('/reset-password', ctrl.resetPassword);
router.get('/me', protect, (req, res) => res.json({ id: req.user.id }));

module.exports = router;
