const { User, Subscription, Plan } = require('../models');
const logger = require('../utils/logger');

async function loadBusinessContext(userId) {
  const user = await User.findByPk(userId);
  if (!user) {
    const err = new Error('Empresa não encontrada.');
    err.status = 404;
    throw err;
  }

  const subscription = await Subscription.findOne({
    where: { userId: user.id, status: 'active' },
    include: [{ model: Plan, as: 'plan' }],
    order: [['createdAt', 'DESC']],
  });

  return { user, subscription };
}

function requirePlan(allowedPlanKeys = [], options = {}) {
  const normalizedAllowed = allowedPlanKeys.map((key) => key.toLowerCase());
  const {
    attachUser = true,
    attachSubscription = true,
    errorMessage = 'Assinatura atual não permite acessar este recurso.',
  } = options;

  return async (req, res, next) => {
    try {
      // Bypass opcional para sandbox de testes do Stripe Connect
      const allowAll = String(process.env.CONNECT_TEST_MODE_ALLOW_ALL || '').toLowerCase() === 'true';
      const userId = req.user?.userId || req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Usuário não autenticado.' });
      }

      const { user, subscription } = await loadBusinessContext(userId);

      if (!allowAll && (!subscription || !subscription.plan)) {
        return res.status(403).json({ message: errorMessage });
      }

      if (!allowAll && subscription?.expiresAt) {
        const expiresAt = new Date(subscription.expiresAt);
        if (expiresAt <= new Date()) {
          await subscription.update({ status: 'expired' });
          return res.status(403).json({ message: 'Assinatura expirada. Renove para continuar.' });
        }
      }

      const planKey = (subscription?.plan?.key || '').toLowerCase();
      if (!allowAll && normalizedAllowed.length > 0 && !normalizedAllowed.includes(planKey)) {
        return res.status(403).json({ message: errorMessage });
      }

      if (attachUser) {
        req.businessUser = user;
      }
      if (attachSubscription) {
        req.businessSubscription = subscription;
      }

      return next();
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ message: error.message });
      }
      logger.error('requirePlan.unhandled_error', { error: error.message });
      return res.status(500).json({ message: 'Erro ao validar plano da empresa.' });
    }
  };
}

module.exports = {
  requirePlan,
};
