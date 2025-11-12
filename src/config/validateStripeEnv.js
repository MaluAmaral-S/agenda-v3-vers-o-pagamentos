const logger = require('../utils/logger');

function validateStripeEnvironment() {
  const missing = [];
  if (!process.env.STRIPE_SECRET_KEY) {
    missing.push('STRIPE_SECRET_KEY');
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    missing.push('STRIPE_WEBHOOK_SECRET');
  }

  if (missing.length > 0) {
    logger.warn('stripe.env.missing_variables', { missing });

    const env = String(process.env.NODE_ENV || '').toLowerCase();
    const shouldFailHard = ['production', 'staging'].includes(env);
    if (shouldFailHard) {
      throw new Error(`Variáveis obrigatórias da Stripe ausentes: ${missing.join(', ')}`);
    }
  }
}

module.exports = {
  validateStripeEnvironment,
};
