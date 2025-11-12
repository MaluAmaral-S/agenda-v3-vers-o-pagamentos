const { requirePlan } = require('./requirePlan');

const ELIGIBLE_PLAN_KEYS = ['prata', 'ouro'];

const requireMarketplaceAccess = requirePlan(ELIGIBLE_PLAN_KEYS, {
  errorMessage:
    'Seu plano atual não permite utilizar o marketplace de pagamentos. Atualize para o plano Prata ou Ouro.',
});

module.exports = {
  requireMarketplaceAccess,
  ELIGIBLE_PLAN_KEYS,
};
