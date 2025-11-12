const { Payment, User } = require('../models');
const { createCheckoutSessionForClient } = require('../services/stripePaymentService');
const { refreshAccountStatus } = require('../services/stripeConnectService');
const logger = require('../utils/logger');

async function resolveBusinessUser(req) {
  if (req.businessUser) {
    return req.businessUser;
  }
  if (req.user?.userId || req.user?.id) {
    const userId = req.user.userId || req.user.id;
    const user = await User.findByPk(userId);
    return user || null;
  }
  return null;
}

function resolveCreatorUserId(req) {
  return req.user?.userId || req.user?.id || null;
}

exports.createCheckoutSession = async (req, res) => {
  try {
    const businessUser = await resolveBusinessUser(req);
    if (!businessUser) {
      logger.warn('payment.checkout.rejected', { reason: 'unauthenticated' });
      return res.status(401).json({ message: 'Usuário não autenticado.' });
    }

    if (!businessUser.paymentsEnabled) {
      logger.warn('payment.checkout.rejected', {
        reason: 'payments_disabled',
        businessId: businessUser.id,
      });
      return res.status(403).json({ message: 'Pagamentos desativados para esta empresa.' });
    }

    // Em produção, valide estado da conta conectada antes de criar a sessão
    const allowAll = String(process.env.CONNECT_TEST_MODE_ALLOW_ALL || '').toLowerCase() === 'true';
    if (!allowAll) {
      if (!businessUser.stripeAccountId) {
        logger.warn('payment.checkout.rejected', { reason: 'no_connect_account', businessId: businessUser.id });
        return res.status(403).json({ message: 'Conta Stripe não conectada.' });
      }

      let refreshed = null;
      try {
        refreshed = await refreshAccountStatus(businessUser);
      } catch (err) {
        logger.warn('payment.checkout.refresh_status_failed', {
          businessId: businessUser.id,
          error: err.message,
        });
      }

      const chargesEnabled = Boolean(refreshed?.status?.stripeChargesEnabled ?? businessUser.stripeChargesEnabled);
      const payoutsEnabled = Boolean(refreshed?.status?.stripePayoutsEnabled ?? businessUser.stripePayoutsEnabled);
      const detailsSubmitted = Boolean(refreshed?.status?.stripeDetailsSubmitted ?? businessUser.stripeDetailsSubmitted);

      if (!detailsSubmitted || !chargesEnabled || !payoutsEnabled) {
        logger.warn('payment.checkout.rejected', {
          reason: 'connect_restricted',
          businessId: businessUser.id,
          chargesEnabled,
          payoutsEnabled,
          detailsSubmitted,
        });
        return res.status(403).json({
          message:
            'A conta Stripe conectada está com restrições. Conclua o onboarding e habilite cobranças e repasses para continuar.',
        });
      }
    }

    const targetBusinessId = Number(
      req.body?.empresaId || req.body?.businessId || businessUser.id,
    );

    if (Number.isNaN(targetBusinessId) || targetBusinessId !== Number(businessUser.id)) {
      logger.warn('payment.checkout.rejected', {
        reason: 'business_mismatch',
        businessId: businessUser.id,
        targetBusinessId,
      });
      return res.status(403).json({ message: 'Empresa inválida para criação do pagamento.' });
    }

    const creatorUserId = resolveCreatorUserId(req);
    if (!creatorUserId) {
      logger.warn('payment.checkout.rejected', { reason: 'unauthenticated_creator', businessId: businessUser.id });
      return res.status(401).json({ message: 'Usuário não autenticado.' });
    }

    const { amount, currency, description, successUrl, cancelUrl, customer, metadata, lineItems, amountInCents, appointmentId } =
      req.body || {};

    if (!amount) {
      logger.warn('payment.checkout.rejected', {
        reason: 'missing_amount',
        businessId: businessUser.id,
      });
      return res.status(400).json({ message: 'Valor (amount) é obrigatório.' });
    }

    const result = await createCheckoutSessionForClient({
      businessId: targetBusinessId,
      createdByUserId: creatorUserId,
      amount,
      currency,
      description,
      successUrl,
      cancelUrl,
      customer,
      metadata,
      lineItems,
      amountInCents: amountInCents === true || amountInCents === 'true',
      appointmentId,
    });

    logger.audit('payment.checkout.session.created', {
      businessId: businessUser.id,
      paymentId: result.paymentId,
      sessionId: result.sessionId,
      creatorUserId,
    });

    return res.status(201).json(result);
  } catch (error) {
    logger.error('payment.checkout.unhandled_error', {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({ message: 'Falha ao criar sessão de pagamento.', error: error.message });
  }
};

exports.getPayments = async (req, res) => {
  try {
    const businessUser = await resolveBusinessUser(req);
    if (!businessUser) {
      logger.warn('payment.list.rejected', { reason: 'unauthenticated' });
      return res.status(401).json({ message: 'Usuário não autenticado.' });
    }

    const payments = await Payment.findAll({
      where: { businessId: businessUser.id },
      order: [['createdAt', 'DESC']],
      limit: 100,
    });

    logger.info('payment.list.success', {
      businessId: businessUser.id,
      total: payments.length,
    });

    return res.json({ payments });
  } catch (error) {
    logger.error('payment.list.unhandled_error', {
      error: error.message,
    });
    return res.status(500).json({ message: 'Falha ao listar pagamentos.', error: error.message });
  }
};

exports.getPaymentSettings = async (req, res) => {
  try {
    const businessUser = await resolveBusinessUser(req);
    if (!businessUser) {
      logger.warn('payment.settings.rejected', { reason: 'unauthenticated' });
      return res.status(401).json({ message: 'Usuário não autenticado.' });
    }

    logger.info('payment.settings.viewed', { businessId: businessUser.id });

    return res.json({
      paymentsEnabled: Boolean(businessUser.paymentsEnabled),
      stripeAccountId: businessUser.stripeAccountId || null,
      chargesEnabled: Boolean(businessUser.stripeChargesEnabled),
      payoutsEnabled: Boolean(businessUser.stripePayoutsEnabled),
    });
  } catch (error) {
    logger.error('payment.settings.unhandled_error', {
      error: error.message,
    });
    return res.status(500).json({ message: 'Falha ao obter configurações de pagamentos.', error: error.message });
  }
};

exports.updatePaymentSettings = async (req, res) => {
  try {
    const businessUser = await resolveBusinessUser(req);
    if (!businessUser) {
      logger.warn('payment.settings.rejected', { reason: 'unauthenticated' });
      return res.status(401).json({ message: 'Usuário não autenticado.' });
    }

    const { enabled } = req.body || {};
    const normalized = enabled === true || enabled === 'true';

    await businessUser.update({ paymentsEnabled: normalized });

    logger.audit('payment.settings.updated', {
      businessId: businessUser.id,
      paymentsEnabled: businessUser.paymentsEnabled,
    });

    return res.json({
      paymentsEnabled: businessUser.paymentsEnabled,
      stripeAccountId: businessUser.stripeAccountId || null,
      chargesEnabled: Boolean(businessUser.stripeChargesEnabled),
      payoutsEnabled: Boolean(businessUser.stripePayoutsEnabled),
    });
  } catch (error) {
    logger.error('payment.settings.update_failed', {
      error: error.message,
    });
    return res.status(500).json({ message: 'Falha ao atualizar configurações de pagamentos.', error: error.message });
  }
};
