const { requirePlan } = require('./requirePlan');

const ELIGIBLE_PLAN_KEYS = ['prata', 'ouro'];

const requireStripeConnectAccess = requirePlan(ELIGIBLE_PLAN_KEYS, {
  errorMessage: 'Seu plano atual não permite integração com Stripe Connect. Atualize para o plano Prata ou Ouro.',
});

module.exports = {
  requireStripeConnectAccess,
  ELIGIBLE_PLAN_KEYS,
};
