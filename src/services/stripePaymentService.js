const { Payment, User } = require('../models');
const stripeConnectService = require('./stripeConnectService');
const { getStripeClient } = stripeConnectService;
const refreshAccountStatus =
  typeof stripeConnectService.refreshAccountStatus === 'function'
    ? stripeConnectService.refreshAccountStatus
    : async () => null;
const logger = require('../utils/logger');

function normalizeCurrency(currency) {
  return (currency || 'brl').toLowerCase();
}

function getBaseClientUrl() {
  return (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
}

function appendQueryParams(baseUrl, params = {}) {
  if (!baseUrl) return '';
  const hasQuery = baseUrl.includes('?');
  const separator = hasQuery ? (baseUrl.endsWith('?') || baseUrl.endsWith('&') ? '' : '&') : '?';
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(String(key))}=${encodeURIComponent(String(value))}`)
    .join('&');
  return query ? `${baseUrl}${separator}${query}` : baseUrl;
}

function parseAmountToCents(amount, amountInCents = false) {
  if (amountInCents) {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error('Valor em centavos inválido.');
    }
    return Math.round(parsed);
  }

  if (typeof amount === 'number' && Number.isFinite(amount)) {
    return Math.round(amount * 100);
  }
  if (typeof amount === 'string') {
    const normalized = amount.replace(',', '.');
    const parsed = parseFloat(normalized);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed * 100);
    }
  }
  throw new Error('Valor do pagamento inválido. Envie o total em centavos ou em formato decimal.');
}

function sanitizeMetadata(obj) {
  const MAX_KEY_LEN = 40;
  const MAX_VALUE_LEN = 500;

  return Object.fromEntries(
    Object.entries(obj || {})
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => {
        let normalizedValue;
        if (typeof value === 'string') {
          normalizedValue = value.trim();
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          normalizedValue = String(value);
        } else {
          try {
            normalizedValue = JSON.stringify(value);
          } catch (_err) {
            normalizedValue = String(value);
          }
        }

        if (normalizedValue.length > MAX_VALUE_LEN) {
          normalizedValue = `${normalizedValue.slice(0, MAX_VALUE_LEN - 3)}...`;
        }

        const normalizedKey = String(key).trim().slice(0, MAX_KEY_LEN);
        return [normalizedKey, normalizedValue];
      })
  );
}

async function ensureBusiness(businessId) {
  const business = await User.findByPk(businessId);
  if (!business) {
    throw new Error('Empresa não encontrada.');
  }
  return business;
}

/**
 * Cria uma sessão de checkout para o cliente final.
 * Etapas:
 *  1. Valida plano/conta da empresa e normaliza o valor em centavos.
 *  2. Registra o Payment localmente (status pendente) para manter idempotência.
 *  3. Cria a Checkout Session apontando transfer_data.destination para a conta conectada.
 *  4. Atualiza o registro com os IDs do Stripe para facilitar webhooks futuros.
 */
async function createCheckoutSessionForClient(params) {
  const {
    businessId,
    createdByUserId,
    amount,
    currency,
    description,
    successUrl,
    cancelUrl,
    customer,
    metadata,
    lineItems,
    amountInCents = false,
    appointmentId = null,
  } = params;

  const business = await ensureBusiness(businessId);
  if (!business.stripeAccountId) {
    throw new Error('Empresa não possui conta Stripe conectada.');
  }

  // Em produção, evite criar cobranças quando a conta conectada estiver restrita.
  // Isso previne que o valor liquide na conta da plataforma quando a Connect estiver bloqueada.
  const allowAll = String(process.env.CONNECT_TEST_MODE_ALLOW_ALL || '').toLowerCase() === 'true';
  if (!allowAll) {
    let chargesEnabled = Boolean(business.stripeChargesEnabled);
    let payoutsEnabled = Boolean(business.stripePayoutsEnabled);
    let detailsSubmitted = Boolean(business.stripeDetailsSubmitted);

    try {
      const refreshed = await refreshAccountStatus(business);
      if (refreshed?.status) {
        chargesEnabled = Boolean(refreshed.status.stripeChargesEnabled);
        payoutsEnabled = Boolean(refreshed.status.stripePayoutsEnabled);
        detailsSubmitted = Boolean(refreshed.status.stripeDetailsSubmitted);
      }
    } catch (err) {
      logger.warn('payment.checkout.refresh_status_failed', {
        businessId: business.id,
        error: err.message,
      });
    }

    if (!detailsSubmitted || !chargesEnabled || !payoutsEnabled) {
      throw new Error(
        'A conta Stripe conectada está com restrições. Conclua o onboarding e habilite cobranças e repasses para continuar.'
      );
    }
  }

  const totalAmount = parseAmountToCents(amount, amountInCents);
  if (totalAmount <= 0) {
    throw new Error('O valor do pagamento deve ser maior que zero.');
  }
  const normalizedCurrency = normalizeCurrency(currency);
  const stripe = getStripeClient();
  const baseClientUrl = getBaseClientUrl();

  const defaultLineItems = [
    {
      price_data: {
        currency: normalizedCurrency,
        unit_amount: totalAmount,
        product_data: {
          name: description || 'Pagamento de agendamento',
        },
      },
      quantity: 1,
    },
  ];

  const requestMetadata = sanitizeMetadata(
    typeof metadata === 'object' && metadata !== null ? metadata : {}
  );

  const payment = await Payment.create({
    businessId: business.id,
    createdByUserId,
    amount: totalAmount,
    currency: normalizedCurrency,
    customerName: customer?.name || null,
    customerEmail: customer?.email || null,
    customerPhone: customer?.phone || null,
    status: 'pending',
    metadata: Object.keys(requestMetadata).length ? requestMetadata : null,
  });

  logger.audit('payment.checkout.initiated', {
    paymentId: payment.id,
    businessId: business.id,
    createdByUserId,
    amount: totalAmount,
    currency: normalizedCurrency,
  });

  const baseMetadata = {
    paymentId: String(payment.id),
    businessId: String(business.id),
    createdByUserId: createdByUserId ? String(createdByUserId) : undefined,
    appointmentId: appointmentId ? String(appointmentId) : undefined,
  };

  try {
    const combinedMetadata = sanitizeMetadata({
      ...baseMetadata,
      ...requestMetadata,
    });

    const wantsLocalMethods = normalizedCurrency === 'brl';
    const boletoExpiryDays = Number(process.env.STRIPE_BOLETO_EXPIRY_DAYS || 3);
    const pixExpiryMinutes = Number(process.env.STRIPE_PIX_EXPIRY_MINUTES || 30);
    const pixExpirySeconds = Number.isFinite(pixExpiryMinutes) && pixExpiryMinutes > 0
      ? Math.round(pixExpiryMinutes * 60)
      : 1800;

    const desiredPaymentMethods = wantsLocalMethods ? ['card', 'boleto', 'pix'] : ['card'];
    await payment.update({ requestedPaymentMethods: desiredPaymentMethods });

    const transferGroup = appointmentId ? `appointment-${appointmentId}` : `payment-${payment.id}`;

    const buildPaymentIntentData = () => ({
      // 100% do valor é destinado à conta conectada
      transfer_data: {
        destination: business.stripeAccountId,
        amount: totalAmount,
      },
      on_behalf_of: business.stripeAccountId,
      metadata: combinedMetadata,
      transfer_group: transferGroup,
    });

    const buildPaymentMethodOptions = (paymentMethodTypes) => {
      const options = {};

      if (paymentMethodTypes.includes('boleto')) {
        const days = Number.isFinite(boletoExpiryDays) && boletoExpiryDays > 0 ? boletoExpiryDays : 3;
        options.boleto = { expires_after_days: days };
      }

      if (paymentMethodTypes.includes('pix')) {
        const safeSeconds = Number.isFinite(pixExpirySeconds) && pixExpirySeconds > 0 ? pixExpirySeconds : 1800;
        options.pix = { expires_after_seconds: safeSeconds };
      }

      return Object.keys(options).length ? options : undefined;
    };

    const successParams = {
      session_id: '{CHECKOUT_SESSION_ID}',
      payment_id: payment.id,
    };
    if (appointmentId) {
      successParams.appointment_id = appointmentId;
    }

    const cancelParams = {
      canceled: 'true',
      session_id: '{CHECKOUT_SESSION_ID}',
    };
    if (appointmentId) {
      cancelParams.appointment_id = appointmentId;
    }

    const successUrlBase = (successUrl || `${baseClientUrl}/pagamento/sucesso`).trim();
    const cancelUrlBase = (cancelUrl || `${baseClientUrl}/pagamento/cancelado`).trim();

    let appliedPaymentMethods = desiredPaymentMethods;
    let lastStripeErrorCode = null;

    const attemptSessionCreation = async (paymentMethodTypes) =>
      stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: paymentMethodTypes,
        line_items: lineItems && lineItems.length ? lineItems : defaultLineItems,
        success_url: appendQueryParams(successUrlBase, successParams),
        cancel_url: appendQueryParams(cancelUrlBase, cancelParams),
        customer_email: customer?.email || undefined,
        client_reference_id: String(payment.id),
        metadata: combinedMetadata,
        payment_intent_data: buildPaymentIntentData(),
        payment_method_options: buildPaymentMethodOptions(paymentMethodTypes),
        locale: 'pt-BR',
        billing_address_collection: 'auto',
        customer_creation: 'if_required',
        phone_number_collection: { enabled: true },
      });

    let session;
    try {
      session = await attemptSessionCreation(desiredPaymentMethods);
    } catch (error) {
      const msg = error?.message || '';
      lastStripeErrorCode = error?.code || error?.raw?.code || null;
      const isPaymentMethodUnavailable = /payment method type/i.test(msg) || /cannot be used/i.test(msg);
      if (wantsLocalMethods && isPaymentMethodUnavailable) {
        logger.warn('payment.checkout.local_method_unavailable', {
          paymentId: payment.id,
          businessId: business.id,
          requested: desiredPaymentMethods,
          fallback: ['card'],
          error: msg,
        });
        appliedPaymentMethods = ['card'];
        session = await attemptSessionCreation(appliedPaymentMethods);
      } else {
        throw error;
      }
    }

    const metadataForStorage = Object.keys(combinedMetadata).length ? combinedMetadata : null;

    await payment.update({
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : payment.stripePaymentIntentId,
      stripeCustomerId: session.customer || customer?.stripeCustomerId || payment.stripeCustomerId,
      metadata: metadataForStorage,
      appliedPaymentMethods,
      lastStripeErrorCode,
    });

    logger.audit('payment.checkout.session.ready', {
      paymentId: payment.id,
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
      businessId: business.id,
      amount: totalAmount,
      currency: normalizedCurrency,
    });

    return {
      checkoutUrl: session.url,
      sessionId: session.id,
      paymentId: payment.id,
      paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
      transferGroup,
      paymentMethods: {
        requested: desiredPaymentMethods,
        applied: appliedPaymentMethods,
        fallbackErrorCode: lastStripeErrorCode,
      },
    };
  } catch (error) {
    logger.error('payment.checkout.session.failed', {
      paymentId: payment.id,
      businessId: business.id,
      error: error.message,
    });
    await payment.update({
      status: 'failed',
      failureReason: error.message,
      lastStripeErrorCode: error?.code || error?.raw?.code || null,
    });
    throw error;
  }
}

async function refundPaymentIntent(paymentIntentId, options = {}) {
  if (!paymentIntentId) {
    throw new Error('paymentIntentId é obrigatório para reembolso.');
  }

  const stripe = getStripeClient();
  try {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      reverse_transfer: true,
      refund_application_fee: true,
      ...(options.metadata ? { metadata: options.metadata } : {}),
    });

    const paymentRecord = await Payment.findOne({ where: { stripePaymentIntentId: paymentIntentId } });
    if (paymentRecord) {
      await paymentRecord.update({ status: 'refunded', failureReason: null });
    }

    logger.audit('payment.refund.created', {
      paymentIntentId,
      refundId: refund.id,
      amount: refund.amount,
      currency: refund.currency,
    });

    return refund;
  } catch (error) {
    logger.error('payment.refund.failed', {
      paymentIntentId,
      error: error.message,
    });
    throw error;
  }
}

module.exports = {
  createCheckoutSessionForClient,
  refundPaymentIntent,
};
