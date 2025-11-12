const Stripe = require('stripe');
const { User, Subscription, Plan, StripeEvent, Payment, Appointment } = require('../models');
const { getSubscriptionDurationDays } = require('../config/planConfig');
const { extractAccountStatus } = require('../services/stripeConnectService');
const logger = require('../utils/logger');

/**
 * Modo debug: permite processar eventos sem verificaÃ§Ã£o de assinatura (NÃƒO use em produÃ§Ã£o).
 * STRIPE_ALLOW_UNVERIFIED_WEBHOOKS=true
 */
const ALLOW_UNVERIFIED = String(process.env.STRIPE_ALLOW_UNVERIFIED_WEBHOOKS || '').toLowerCase() === 'true';

let stripeClient;
function getStripe() {
  if (stripeClient) return stripeClient;
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error('STRIPE_SECRET_KEY nÇœo configurada.');
  }
  stripeClient = new Stripe(secret);
  return stripeClient;
}

/** Resolve planKey/planId do frontend */
function resolvePlanFromInput(planInput) {
  const map = {
    1: { planKey: 'bronze', displayName: 'Bronze' },
    2: { planKey: 'prata', displayName: 'Prata' },
    3: { planKey: 'ouro', displayName: 'Ouro' },
    bronze: { planKey: 'bronze', displayName: 'Bronze' },
    prata: { planKey: 'prata', displayName: 'Prata' },
    ouro: { planKey: 'ouro', displayName: 'Ouro' },
    silver: { planKey: 'prata', displayName: 'Prata' },
    gold: { planKey: 'ouro', displayName: 'Ouro' },
  };
  const key = (planInput ?? '').toString().toLowerCase();
  return map[key];
}

const getPriceIdForPlan = (planName) => {
  const normalized = (planName || '').toString().trim().toLowerCase();
  const priceMap = {
    bronze: process.env.STRIPE_BRONZE_PRICE_ID,
    prata: process.env.STRIPE_PRATA_PRICE_ID,
    ouro: process.env.STRIPE_OURO_PRICE_ID,
  };
  return priceMap[normalized];
};

async function recordStripeEvent(event) {
  if (!event?.id) return null;
  try {
    const [entry, created] = await StripeEvent.findOrCreate({
      where: { eventId: event.id },
      defaults: {
        eventId: event.id,
        type: event.type,
        status: 'received',
        requestId: event.request?.id || event.request || null,
        livemode: Boolean(event.livemode),
        payload: event,
      },
    });

    if (!created && entry.status === 'failed') {
      // Reprocessamentos podem atualizar payload para vers??o mais recente
      await entry.update({
        type: event.type,
        requestId: event.request?.id || event.request || null,
        livemode: Boolean(event.livemode),
        payload: event,
        status: 'received',
        processedAt: null,
        errorMessage: null,
      });
    }
    return entry;
  } catch (error) {
    console.warn('[stripe] N??o foi poss??vel registrar o evento localmente:', error);
    return null;
  }
}

async function updateStripeEventLog(entry, updates) {
  if (!entry) return;
  try {
    await entry.update({ ...updates });
  } catch (error) {
    console.warn('[stripe] Falha ao atualizar o evento registrado:', error);
  }
}

function derivePaymentStatus(stripeStatus, fallback = 'pending') {
  const normalized = String(stripeStatus || '').toLowerCase();
  if (!normalized) return fallback;
  if (['active', 'trialing'].includes(normalized)) return 'paid';
  if (['past_due', 'incomplete', 'incomplete_expired', 'requires_payment_method'].includes(normalized)) return 'pending';
  if (['unpaid', 'canceled', 'cancelled'].includes(normalized)) return 'unpaid';
  return normalized;
}

function compactUpdates(object) {
  return Object.fromEntries(
    Object.entries(object || {}).filter(([, value]) => value !== undefined && value !== null)
  );
}

function centsToDecimal(cents) {
  if (cents === null || cents === undefined) return null;
  const amount = Number(cents);
  if (Number.isNaN(amount)) return null;
  return Number((amount / 100).toFixed(2));
}

async function updatePaymentRecordStatus(paymentIntentId, status) {
  if (!paymentIntentId) return;
  const payment = await Payment.findOne({ where: { stripePaymentIntentId: paymentIntentId } });
  if (!payment) return;
  await payment.update({ status });
}

async function markAppointmentPaidFromMetadata(metadata, paymentIntentId, amountCents) {
  const appointmentIdRaw = metadata?.appointmentId || metadata?.appointment_id;
  const appointmentId = appointmentIdRaw ? Number(appointmentIdRaw) : null;
  if (!appointmentId) {
    return;
  }

  const appointment = await Appointment.findByPk(appointmentId);
  if (!appointment) {
    logger.warn('appointment.payment.metadata_not_found', { appointmentId });
    return;
  }

  const updates = compactUpdates({
    paymentIntentId: paymentIntentId || appointment.paymentIntentId,
    statusPagamento: 'pago',
    paymentStatus: 'paid',
    valorPago: centsToDecimal(amountCents) ?? appointment.valorPago,
  });

  await appointment.update(updates);

  logger.audit('appointment.payment.mark_paid', {
    appointmentId,
    paymentIntentId,
    amount: updates.valorPago,
  });
}

async function markAppointmentRefunded(paymentIntentId, amountCents, status) {
  if (!paymentIntentId) return;
  const appointment = await Appointment.findOne({ where: { paymentIntentId } });
  if (!appointment) {
    logger.warn('appointment.refund.unknown', { paymentIntentId });
    return;
  }

  const normalizedStatus = status === 'failed' ? 'pago' : status === 'pending' ? 'pago' : 'reembolsado';
  const updates = compactUpdates({
    statusPagamento: normalizedStatus === 'reembolsado' ? 'reembolsado' : appointment.statusPagamento,
    paymentStatus: normalizedStatus === 'reembolsado' ? 'refunded' : 'paid',
  });

  if (normalizedStatus === 'reembolsado' && amountCents !== undefined && amountCents !== null) {
    const refundedValue = centsToDecimal(amountCents);
    if (refundedValue !== null && (appointment.valorPago === null || refundedValue <= Number(appointment.valorPago))) {
      updates.valorPago = appointment.valorPago;
    }
  }

  if (Object.keys(updates).length > 0) {
    await appointment.update(updates);
  }

  logger.audit('appointment.refund.synced', {
    appointmentId: appointment.id,
    paymentIntentId,
    status: normalizedStatus,
  });
}

async function handleClientCheckoutCompleted(session) {
  const metadata = session?.metadata || {};
  const paymentIdRaw = metadata.paymentId || metadata.payment_id || null;
  const paymentId = paymentIdRaw ? Number(paymentIdRaw) : null;

  if (!paymentId) {
    logger.warn('payment.webhook.checkout.ignored', {
      reason: 'missing_payment_id',
      sessionId: session?.id,
    });
    return {
      status: 'ignored',
      error: 'checkout.session.completed sem paymentId para pagamentos de clientes',
    };
  }

  const payment = await Payment.findByPk(paymentId);
  if (!payment) {
    logger.warn('payment.webhook.checkout.unknown_payment', {
      paymentId,
      sessionId: session?.id,
    });
    return {
      status: 'ignored',
      error: `Pagamento ${paymentId} não encontrado localmente`,
    };
  }

  const combinedMetadata = {
    ...(payment.metadata || {}),
    ...(metadata || {}),
  };

  const paymentStatusRaw = session.payment_status || payment.status;
  const paymentStatus = paymentStatusRaw === 'paid' ? 'succeeded' : paymentStatusRaw || payment.status;

  await payment.update(
    compactUpdates({
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : payment.stripePaymentIntentId,
      stripeCustomerId: session.customer || payment.stripeCustomerId,
      status: paymentStatus,
      failureReason: null,
      metadata: combinedMetadata,
    }),
  );

  logger.audit('payment.webhook.checkout.completed', {
    paymentId,
    sessionId: session.id,
    paymentStatus,
  });

  await markAppointmentPaidFromMetadata(combinedMetadata, session.payment_intent, session.amount_total);

  return {
    status: 'processed',
    error: null,
    eventMeta: {
      paymentId,
      paymentStatus,
    },
  };
}

async function handlePaymentIntentSucceeded(intent) {
  const metadata = intent?.metadata || {};
  const paymentIdMeta = metadata.paymentId || metadata.payment_id || null;
  let payment = null;

  if (paymentIdMeta) {
    payment = await Payment.findByPk(Number(paymentIdMeta));
  }

  if (!payment) {
    payment = await Payment.findOne({ where: { stripePaymentIntentId: intent.id } });
  }

  if (!payment) {
    logger.warn('payment.webhook.intent.unknown_payment', {
      paymentIntentId: intent.id,
      reason: 'not_found',
    });
    return {
      status: 'ignored',
      error: `Pagamento não encontrado para payment_intent ${intent.id}`,
    };
  }

  const combinedMetadata = {
    ...(payment.metadata || {}),
    ...(metadata || {}),
  };

  await payment.update(
    compactUpdates({
      stripePaymentIntentId: intent.id,
      stripeCustomerId: intent.customer || payment.stripeCustomerId,
      status: 'succeeded',
      failureReason: null,
      metadata: combinedMetadata,
    }),
  );

  logger.audit('payment.webhook.intent.succeeded', {
    paymentId: payment.id,
    paymentIntentId: intent.id,
  });

  await updatePaymentRecordStatus(intent.id, 'succeeded');
  await markAppointmentPaidFromMetadata(combinedMetadata, intent.id, intent.amount_received);

  return {
    status: 'processed',
    error: null,
    eventMeta: {
      paymentId: payment.id,
      paymentStatus: 'succeeded',
    },
  };
}

async function syncConnectedAccountStatus(account) {
  const snapshot = extractAccountStatus(account);
  const [updatedCount] = await User.update(snapshot, { where: { stripeAccountId: account.id } });

  if (updatedCount === 0) {
    logger.warn('payment.webhook.account.ignored', {
      accountId: account.id,
      reason: 'user_not_found',
    });
    return {
      status: 'ignored',
      error: `Nenhum usuário vinculado à conta conectada ${account.id}`,
    };
  }

  logger.audit('payment.webhook.account.synced', {
    accountId: account.id,
    chargesEnabled: snapshot.stripeChargesEnabled,
    payoutsEnabled: snapshot.stripePayoutsEnabled,
  });

  return {
    status: 'processed',
    error: null,
    eventMeta: {
      accountId: account.id,
      chargesEnabled: snapshot.stripeChargesEnabled,
      payoutsEnabled: snapshot.stripePayoutsEnabled,
    },
  };
}

exports.createCheckoutSession = async (req, res) => {
  const planInput = req.body.planKey ?? req.body.planId;
  const userId = req.user?.userId || req.user?.id;
  try {
    const stripe = getStripe();
    const resolved = resolvePlanFromInput(planInput);
    if (!resolved) return res.status(404).json({ error: 'Plano não encontrado.' });

    const planRecord = await Plan.findOne({ where: { key: resolved.planKey, isActive: true } });
    if (!planRecord) {
      return res.status(404).json({ error: 'Plano não cadastrado na base local.' });
    }

    const priceId = getPriceIdForPlan(resolved.displayName);
    if (!priceId) return res.status(400).json({ error: 'ID de preço do Stripe não configurado.' });

    const user = await User.findByPk(userId);
    const existing = await Subscription.findOne({ where: { userId }, order: [['createdAt', 'DESC']] });
    let stripeCustomerId = existing?.stripeCustomerId || null;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { userId: user.id } });
      stripeCustomerId = customer.id;
    }

    const wantsLocalMethods = String(process.env.STRIPE_SUBSCRIPTION_ENABLE_LOCAL_METHODS || 'true').toLowerCase() !== 'false';
    const desiredPaymentMethods = wantsLocalMethods ? ['card', 'boleto', 'pix'] : ['card'];
    const boletoExpiryDays = Number(process.env.STRIPE_SUBSCRIPTION_BOLETO_EXPIRY_DAYS || process.env.STRIPE_BOLETO_EXPIRY_DAYS || 3);
    const pixExpiryMinutes = Number(process.env.STRIPE_SUBSCRIPTION_PIX_EXPIRY_MINUTES || process.env.STRIPE_PIX_EXPIRY_MINUTES || 30);
    const buildPaymentMethodOptions = (paymentMethodTypes) => {
      const options = {};
      if (paymentMethodTypes.includes('boleto')) {
        const days = Number.isFinite(boletoExpiryDays) && boletoExpiryDays > 0 ? boletoExpiryDays : 3;
        options.boleto = { expires_after_days: days };
      }
      if (paymentMethodTypes.includes('pix')) {
        const expiresAfterSeconds = Number.isFinite(pixExpiryMinutes) && pixExpiryMinutes > 0
          ? Math.round(pixExpiryMinutes * 60)
          : 1800;
        options.pix = { expires_after_seconds: expiresAfterSeconds };
      }
      return Object.keys(options).length ? options : undefined;
    };

    const desiredPaymentMethodMetadata = desiredPaymentMethods.join(',');

    const clientBaseUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
    const successUrl = `${clientBaseUrl}/minha-assinatura?status=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${clientBaseUrl}/planos?status=cancelled&session_id={CHECKOUT_SESSION_ID}`;

    const attemptSessionCreation = (paymentMethodTypes) =>
      stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: paymentMethodTypes,
        customer: stripeCustomerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        payment_method_options: buildPaymentMethodOptions(paymentMethodTypes),
        metadata: {
          userId,
          planKey: resolved.planKey,
          requestedPaymentMethods: paymentMethodTypes.join(','),
          desiredPaymentMethods: desiredPaymentMethodMetadata,
        },
      });

    let session;
    try {
      session = await attemptSessionCreation(desiredPaymentMethods);
    } catch (error) {
      const message = error?.message || '';
      const isPaymentMethodUnavailable = /payment method type/i.test(message) || /cannot be used/i.test(message);
      if (wantsLocalMethods && isPaymentMethodUnavailable) {
        console.warn('[stripe] Métodos locais indisponíveis na criação da sessão de assinatura, fazendo fallback para cartão.', {
          error: message,
        });
        session = await attemptSessionCreation(['card']);
      } else {
        throw error;
      }
    }

    try {
      await Subscription.update(
        { status: 'canceled', paymentStatus: 'canceled' },
        { where: { userId, status: 'pending' } },
      );
      await Subscription.create({
        userId,
        planId: planRecord.id,
        status: 'pending',
        paymentStatus: 'pending',
        stripeCustomerId,
        stripePriceId: priceId,
        cancelAtPeriodEnd: false,
      });
    } catch (err) {
      console.warn('[stripe] falha ao registrar assinatura pendente:', err);
    }

    return res.json({ url: session.url });
  } catch (e) {
    console.error('Erro ao criar sessão de checkout:', e);
    return res.status(500).json({ error: { message: e.message } });
  }
};
exports.createPortalSession = async (req, res) => {
  const userId = req.user?.userId || req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'NÇœo autenticado.' });
  }

  try {
    const stripe = getStripe();
    const subscription = await Subscription.findOne({
      where: { userId },
      order: [['createdAt', 'DESC']],
    });

    let stripeCustomerId = subscription?.stripeCustomerId || null;

    if (!stripeCustomerId) {
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ error: 'UsuÇ­rio nÇœo encontrado.' });
      }

      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id },
      });
      stripeCustomerId = customer.id;

      if (subscription) {
        await subscription.update({ stripeCustomerId });
      }
    }

    const returnUrlBase = process.env.CLIENT_URL || 'http://localhost:5173';
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${returnUrlBase.replace(/\/$/, '')}/minha-assinatura`,
    });

    return res.json({ url: session.url });
  } catch (e) {
    console.error('Erro ao criar sessÇœo do portal:', e);
    return res.status(500).json({ error: { message: e.message } });
  }
};

exports.cancelSubscription = async (req, res) => {
  const userId = req.user?.userId || req.user?.id;
  const { subscriptionId, cancelImmediately = false, refundLastInvoice = false } = req.body || {};

  if (!subscriptionId) {
    return res.status(400).json({ success: false, error: 'subscriptionId é obrigatório.' });
  }

  try {
    const stripe = getStripe();
    const subscriptionRecord = await Subscription.findOne({ where: { stripeSubscriptionId: subscriptionId } });

    if (!subscriptionRecord) {
      return res.status(404).json({ success: false, error: 'Assinatura não encontrada.' });
    }

    if (userId && subscriptionRecord.userId && subscriptionRecord.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Assinatura não pertence ao usuário autenticado.' });
    }

    let updatedSubscription;
    if (cancelImmediately) {
      updatedSubscription = await stripe.subscriptions.cancel(subscriptionId, {
        invoice_now: false,
        prorate: String(process.env.STRIPE_SUBSCRIPTION_CANCEL_PRORATE || 'false').toLowerCase() === 'true',
      });
    } else {
      updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    }

    const stripePeriodEnd = updatedSubscription.current_period_end
      ? new Date(updatedSubscription.current_period_end * 1000)
      : subscriptionRecord.expiresAt;
    const periodEnd = cancelImmediately ? new Date() : stripePeriodEnd;
    const cancelAtPeriodEnd = cancelImmediately ? false : Boolean(updatedSubscription.cancel_at_period_end);
    const status = updatedSubscription.status || subscriptionRecord.status;

    const paymentStatus = derivePaymentStatus(status, subscriptionRecord.paymentStatus);

    await subscriptionRecord.update({
      status,
      paymentStatus,
      currentPeriodEnd: periodEnd,
      expiresAt: periodEnd,
      cancelAtPeriodEnd,
    });

    let refundSummary = null;
    if (refundLastInvoice) {
      try {
        let targetInvoice = null;
        if (typeof updatedSubscription.latest_invoice === 'string') {
          targetInvoice = await stripe.invoices.retrieve(updatedSubscription.latest_invoice);
        } else if (updatedSubscription.latest_invoice?.id) {
          targetInvoice = updatedSubscription.latest_invoice;
        }

        if (!targetInvoice) {
          const invoices = await stripe.invoices.list({ subscription: subscriptionId, limit: 1 });
          targetInvoice = invoices.data[0] || null;
        }

        const paymentIntentId = targetInvoice?.payment_intent
          ? (typeof targetInvoice.payment_intent === 'string'
            ? targetInvoice.payment_intent
            : targetInvoice.payment_intent.id)
          : null;

        if (paymentIntentId) {
          const refund = await stripe.refunds.create({
            payment_intent: paymentIntentId,
            reverse_transfer: true,
            refund_application_fee: true,
            metadata: {
              subscriptionId,
              reason: 'subscription_cancel_refund',
            },
          });
          await updatePaymentRecordStatus(paymentIntentId, 'refunded');
          refundSummary = {
            refundId: refund.id,
            amount: refund.amount,
            currency: refund.currency,
            status: refund.status,
          };
        } else {
          console.warn('[stripe] Nenhum payment_intent encontrado para reembolso da assinatura cancelada.');
        }
      } catch (refundError) {
        console.error('Erro ao processar reembolso da assinatura cancelada:', refundError);
        refundSummary = { error: refundError.message };
      }
    }

    return res.json({
      success: true,
      message: cancelImmediately
        ? 'Assinatura cancelada imediatamente.'
        : 'Assinatura será cancelada ao fim do período ativo.',
      endDate: periodEnd ? periodEnd.toISOString() : null,
      cancelAtPeriodEnd,
      status,
      refund: refundSummary,
    });
  } catch (error) {
    console.error('Erro ao cancelar assinatura no Stripe:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || 'Falha ao cancelar assinatura.',
    });
  }
};

exports.confirmSubscriptionCheckout = async (req, res) => {
  const userId = req.user?.userId || req.user?.id;
  const sessionId = req.body?.sessionId || req.query?.session_id;

  if (!userId) {
    return res.status(401).json({ error: 'Não autenticado.' });
  }

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'sessionId é obrigatório.' });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session || session.mode !== 'subscription') {
      return res.status(404).json({ error: 'Sessão não pertence a uma assinatura.' });
    }

    const metadata = session.metadata || {};
    const metadataUserIdRaw = metadata.userId || metadata.userID || metadata.user_id || null;
    const metadataUserId = metadataUserIdRaw ? Number(metadataUserIdRaw) : null;

    if (metadataUserId && metadataUserId !== userId) {
      return res.status(403).json({ error: 'Sessão pertence a outro usuário.' });
    }

    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return res.status(409).json({
        error: 'Pagamento ainda não confirmado pela Stripe.',
        payment_status: session.payment_status,
      });
    }

    const planKey = metadata.planKey || metadata.plan || null;
    const stripeSubscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;
    const stripeCustomerId =
      typeof session.customer === 'string' ? session.customer : session.customer?.id;

    if (!planKey || !stripeSubscriptionId || !stripeCustomerId) {
      return res.status(400).json({ error: 'Sessão não possui dados suficientes para ativar o plano.' });
    }

    const subscriptionRecord = await activateSubscriptionForCheckout({
      stripeInstance: stripe,
      userId,
      planKey,
      stripeSubscriptionId,
      stripeCustomerId,
    });

    const subscriptionWithPlan = await Subscription.findByPk(subscriptionRecord.id, {
      include: [{ model: Plan, as: 'plan' }],
    });

    return res.json({
      ok: true,
      subscription: {
        id: subscriptionWithPlan.id,
        status: subscriptionWithPlan.status,
        startsAt: subscriptionWithPlan.startsAt,
        expiresAt: subscriptionWithPlan.expiresAt,
        cancelAtPeriodEnd: Boolean(subscriptionWithPlan.cancelAtPeriodEnd),
        plan: subscriptionWithPlan.plan
          ? {
              key: subscriptionWithPlan.plan.key,
              name: subscriptionWithPlan.plan.name,
              monthlyLimit: subscriptionWithPlan.plan.monthlyLimit,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('[stripe] Falha ao confirmar assinatura pelo session_id:', error.message);
    return res.status(500).json({ error: 'Não foi possível confirmar o pagamento da assinatura.' });
  }
};

async function resolvePlanIdFromMetadata(value) {
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber) && Number.isInteger(asNumber)) {
    const found = await Plan.findByPk(asNumber);
    if (found) return found.id;
  }
  const normalizedKey = (value || '').toString().toLowerCase();
  const byKey = await Plan.findOne({ where: { key: normalizedKey, isActive: true } });
  return byKey ? byKey.id : null;
}

async function activateSubscriptionForCheckout({
  stripeInstance = null,
  userId,
  planKey,
  stripeSubscriptionId,
  stripeCustomerId,
}) {
  if (!userId) {
    throw new Error('Usuário inválido ao ativar assinatura.');
  }
  if (!planKey || !stripeSubscriptionId || !stripeCustomerId) {
    throw new Error('Dados incompletos para ativar a assinatura.');
  }

  const finalPlanId = await resolvePlanIdFromMetadata(planKey);
  if (!finalPlanId) {
    throw new Error('Plano associado à assinatura não foi encontrado.');
  }

  const stripe = stripeInstance || getStripe();
  let currentPeriodEnd;
  let cancelAtPeriodEnd = false;

  try {
    const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    if (!stripeSub || typeof stripeSub.current_period_end !== 'number') {
      throw new Error('current_period_end ausente ou inválido na assinatura do Stripe.');
    }
    currentPeriodEnd = new Date(stripeSub.current_period_end * 1000);
    cancelAtPeriodEnd = Boolean(stripeSub.cancel_at_period_end);
  } catch (error) {
    console.warn(
      `[stripe] Aviso ao buscar dados da assinatura (${stripeSubscriptionId}): ${error.message}. Aplicando fallback local.`,
    );
    const days = getSubscriptionDurationDays();
    currentPeriodEnd = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    cancelAtPeriodEnd = false;
  }

  const subscriptionData = {
    planId: finalPlanId,
    status: 'active',
    paymentStatus: 'paid',
    stripeSubscriptionId,
    stripeCustomerId,
    expiresAt: currentPeriodEnd,
    currentPeriodEnd,
    cancelAtPeriodEnd,
  };

  const existingSubscription = await Subscription.findOne({
    where: { userId },
    order: [['createdAt', 'DESC']],
  });

  if (existingSubscription) {
    await existingSubscription.update({
      ...subscriptionData,
      startsAt: existingSubscription.startsAt || new Date(),
    });
    return existingSubscription;
  }

  return Subscription.create({
    ...subscriptionData,
    userId,
    startsAt: new Date(),
  });
}

/**
 * Processo central dos webhooks da Stripe.
 * - A rota é configurada em POST /webhooks/stripe (ver server.js).
 * - O corpo chega como raw para que possamos validar a assinatura Stripe.
 * - Cada evento é registrado em StripeEvent para debug/reprocessamento.
 * - Eventos relevantes (checkout.session.completed, payment_intent.succeeded,
 *   account.updated, faturas, assinaturas) atualizam o banco local.
 * - Em caso de falha, respondemos 500 para que a Stripe tente novamente.
 */
exports.handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  let stripe;

  try {
    stripe = getStripe();
  } catch (err) {
    console.error('Stripe nao configurado:', err);
    return res.status(500).json({ error: 'Stripe nao configurado.' });
  }

  try {
    if (ALLOW_UNVERIFIED) {
      event = JSON.parse(req.body.toString('utf8'));
      console.log('[stripe] webhook em modo NAO verificado:', event.type);
    } else {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
      console.log('[stripe] webhook verificado:', event.type);
    }
  } catch (err) {
    console.log(`[stripe] Erro na verificacao do webhook: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const eventLog = await recordStripeEvent(event);
  const eventMeta = {};
  let eventStatus = 'processed';
  let errorMessage = null;

  console.log(`[stripe] Webhook recebido: ${event.type} (id=${event.id})`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const metadata = (session && session.metadata) ? session.metadata : {};

        if (session.mode === 'payment') {
          const paymentOutcome = await handleClientCheckoutCompleted(session);
          if (paymentOutcome.eventMeta) {
            Object.assign(eventMeta, paymentOutcome.eventMeta);
          }
          if (paymentOutcome.status !== 'processed') {
            eventStatus = paymentOutcome.status;
            errorMessage = paymentOutcome.error;
          }
          break;
        }

        const planKey = metadata.planKey || metadata.plan || null;
        const rawUserId = metadata.userId || metadata.userID || metadata.user_id || null;
        const userId = rawUserId ? Number(rawUserId) : null;
        const stripeSubscriptionId = session.subscription;
        const stripeCustomerId = session.customer;

        Object.assign(
          eventMeta,
          compactUpdates({
            userId,
            stripeCustomerId,
            stripeSubscriptionId,
            paymentStatus: 'paid',
          }),
        );

        if (!userId || !planKey || !stripeSubscriptionId || !stripeCustomerId) {
          console.error('[stripe] checkout.session.completed com metadata incompleta:', metadata);
          eventStatus = 'ignored';
          errorMessage = 'Metadata incompleta para checkout.session.completed';
          break;
        }

        try {
          const subscriptionRecord = await activateSubscriptionForCheckout({
            stripeInstance: stripe,
            userId,
            planKey,
            stripeSubscriptionId,
            stripeCustomerId,
          });

          Object.assign(
            eventMeta,
            compactUpdates({
              subscriptionId: subscriptionRecord.id,
              planId: subscriptionRecord.planId,
              cancelAtPeriodEnd: subscriptionRecord.cancelAtPeriodEnd,
            }),
          );

          console.log(`[stripe] Assinatura ${stripeSubscriptionId} ativada para o userId=${userId}.`);
        } catch (activationError) {
          console.error('[stripe] Falha ao ativar assinatura pós checkout:', activationError.message);
          eventStatus = 'failed';
          errorMessage = activationError.message;
        }
        break;
      }
      case 'payment_intent.succeeded': {
        const intent = event.data.object;
        const outcome = await handlePaymentIntentSucceeded(intent);
        if (outcome.eventMeta) {
          Object.assign(eventMeta, outcome.eventMeta);
        }
        if (outcome.status !== 'processed') {
          eventStatus = outcome.status;
          errorMessage = outcome.error;
        }
        break;
      }
      case 'payment_intent.payment_failed': {
        const intent = event.data.object;
        const metadata = intent?.metadata || {};
        const paymentIdMeta = metadata.paymentId || metadata.payment_id || null;
        let payment = null;

        if (paymentIdMeta) {
          payment = await Payment.findByPk(Number(paymentIdMeta));
        }
        if (!payment) {
          payment = await Payment.findOne({ where: { stripePaymentIntentId: intent.id } });
        }

        if (!payment) {
          console.warn(`[stripe] payment_intent.payment_failed ignorado: pagamento não encontrado (intent=${intent.id}).`);
          eventStatus = 'ignored';
          errorMessage = `Pagamento não encontrado para payment_intent ${intent.id}`;
          break;
        }

        await payment.update(
          compactUpdates({
            stripePaymentIntentId: intent.id,
            stripeCustomerId: intent.customer || payment.stripeCustomerId,
            status: 'failed',
            failureReason: intent.last_payment_error?.message || 'Pagamento falhou.',
          }),
        );

        logger.warn('payment.webhook.intent.failed', {
          paymentId: payment.id,
          paymentIntentId: intent.id,
        });

        Object.assign(eventMeta, {
          paymentId: payment.id,
          paymentStatus: 'failed',
        });
        await updatePaymentRecordStatus(intent.id, 'failed');
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object;
        const paymentIntentId = charge.payment_intent;
        await markAppointmentRefunded(paymentIntentId, charge.amount_refunded, 'succeeded');
        await updatePaymentRecordStatus(paymentIntentId, 'refunded');
        Object.assign(eventMeta, {
          paymentIntentId,
          refundAmount: charge.amount_refunded,
        });
        break;
      }
      case 'charge.refund.updated': {
        const refund = event.data.object;
        const paymentIntentId = refund.payment_intent;
        await markAppointmentRefunded(paymentIntentId, refund.amount, refund.status);
        if (refund.status === 'succeeded') {
          await updatePaymentRecordStatus(paymentIntentId, 'refunded');
        }
        Object.assign(eventMeta, {
          paymentIntentId,
          refundId: refund.id,
          refundStatus: refund.status,
        });
        break;
      }
      case 'account.updated': {
        const account = event.data.object;
        const outcome = await syncConnectedAccountStatus(account);
        if (outcome.eventMeta) {
          Object.assign(eventMeta, outcome.eventMeta);
        }
        if (outcome.status !== 'processed') {
          eventStatus = outcome.status;
          errorMessage = outcome.error;
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const stripeSubscriptionId = invoice.subscription;
        const stripeCustomerId = invoice.customer;

        Object.assign(eventMeta, compactUpdates({
          stripeSubscriptionId,
          stripeCustomerId,
          paymentStatus: 'paid',
        }));

        if (!stripeSubscriptionId) {
          console.warn('[stripe] invoice.payment_succeeded sem subscription id');
          eventStatus = 'ignored';
          errorMessage = 'Evento sem subscription id';
          break;
        }

        const subscription = await Subscription.findOne({ where: { stripeSubscriptionId } });
        if (!subscription) {
          console.warn(`[stripe] invoice.payment_succeeded para assinatura desconhecida ${stripeSubscriptionId}`);
          eventStatus = 'ignored';
          errorMessage = 'Assinatura nao encontrada localmente';
          break;
        }

        Object.assign(eventMeta, compactUpdates({ userId: subscription.userId }));

        const line = Array.isArray(invoice.lines?.data) ? invoice.lines.data[0] : null;
        const period = line?.period || {};
        const priceId = line?.price?.id || null;

        let startsAt = subscription.startsAt || null;
        let expiresAt = subscription.expiresAt || null;
        let cancelAtPeriodEnd = Boolean(subscription.cancelAtPeriodEnd);

        if (typeof period.start === 'number') {
          startsAt = new Date(period.start * 1000);
        }
        if (typeof period.end === 'number') {
          expiresAt = new Date(period.end * 1000);
        }

        if (!startsAt) {
          startsAt = new Date();
        }
        if (!expiresAt) {
          const days = getSubscriptionDurationDays();
          expiresAt = new Date(startsAt.getTime() + days * 24 * 60 * 60 * 1000);
        }

        try {
          const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
          cancelAtPeriodEnd = Boolean(stripeSubscription?.cancel_at_period_end ?? cancelAtPeriodEnd);
        } catch (retrieveErr) {
          console.warn(`[stripe] Falha ao coletar cancel_at_period_end em invoice.payment_succeeded: ${retrieveErr.message}`);
        }

        Object.assign(eventMeta, compactUpdates({ cancelAtPeriodEnd }));

        await subscription.update({
          status: 'active',
          paymentStatus: 'paid',
          stripeCustomerId: stripeCustomerId || subscription.stripeCustomerId,
          stripePriceId: priceId || subscription.stripePriceId,
          startsAt,
          expiresAt,
          currentPeriodEnd: expiresAt,
          cancelAtPeriodEnd,
        });

        console.log(`[stripe] Assinatura ${stripeSubscriptionId} ativada apos pagamento da fatura.`);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const stripeSubscriptionId = invoice.subscription;
        const stripeCustomerId = invoice.customer;

        Object.assign(eventMeta, compactUpdates({
          stripeSubscriptionId,
          stripeCustomerId,
          paymentStatus: 'unpaid',
        }));

        if (!stripeSubscriptionId) {
          console.warn('[stripe] invoice.payment_failed sem subscription id');
          eventStatus = 'ignored';
          errorMessage = 'Evento sem subscription id';
          break;
        }

        const subscription = await Subscription.findOne({ where: { stripeSubscriptionId } });
        if (!subscription) {
          console.warn(`[stripe] invoice.payment_failed para assinatura desconhecida ${stripeSubscriptionId}`);
          eventStatus = 'ignored';
          errorMessage = 'Assinatura nao encontrada localmente';
          break;
        }

        Object.assign(eventMeta, compactUpdates({ userId: subscription.userId }));

        let stripeSubscription;
        try {
          stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        } catch (retrieveErr) {
          console.warn(`[stripe] Falha ao obter dados da assinatura em invoice.payment_failed: ${retrieveErr.message}`);
        }

        const status = stripeSubscription?.status || 'past_due';
        const paymentStatus = derivePaymentStatus(status, 'pending');
        const periodEndUnix = stripeSubscription?.current_period_end;
        const currentPeriodEnd = typeof periodEndUnix === 'number'
          ? new Date(periodEndUnix * 1000)
          : subscription.currentPeriodEnd;
        const cancelAtPeriodEnd = Boolean(stripeSubscription?.cancel_at_period_end ?? subscription.cancelAtPeriodEnd);

        Object.assign(eventMeta, compactUpdates({
          subscriptionStatus: status,
          cancelAtPeriodEnd,
        }));

        await subscription.update(
          compactUpdates({
            status,
            paymentStatus,
            currentPeriodEnd,
            cancelAtPeriodEnd,
          }),
        );

        console.warn(`[stripe] Assinatura ${stripeSubscriptionId} com pagamento de fatura falhado. Status: ${status}`);
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const stripeSubscription = event.data.object;
        const stripeSubscriptionId = stripeSubscription.id;
        const paymentStatus = derivePaymentStatus(stripeSubscription.status, 'pending');

        Object.assign(eventMeta, compactUpdates({
          stripeSubscriptionId,
          stripeCustomerId: stripeSubscription.customer,
          paymentStatus,
          cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
        }));

        const subscription = await Subscription.findOne({ where: { stripeSubscriptionId } });
        if (subscription) {
          const periodEnd = stripeSubscription.current_period_end
            ? new Date(stripeSubscription.current_period_end * 1000)
            : subscription.expiresAt;

          await subscription.update({
            status: stripeSubscription.status,
            paymentStatus,
            stripePriceId: stripeSubscription.items?.data?.[0]?.price?.id || subscription.stripePriceId,
            currentPeriodEnd: periodEnd,
            expiresAt: periodEnd,
            cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
          });

          Object.assign(eventMeta, compactUpdates({ userId: subscription.userId }));
          console.log(`[stripe] Assinatura ${stripeSubscription.id} atualizada para status ${stripeSubscription.status}`);
          if (stripeSubscription.status === 'canceled') {
            console.log(`Assinatura encerrada para o cliente ${stripeSubscription.customer}`);
          }
        } else {
          eventStatus = 'ignored';
          errorMessage = `Assinatura nao encontrada para ${stripeSubscriptionId}`;
        }
        break;
      }
      default:
        console.log(`Evento nao tratado do tipo ${event.type}`);
        eventStatus = 'ignored';
    }
  } catch (dbError) {
    console.error('Erro no banco ao processar webhook:', dbError);
    await updateStripeEventLog(eventLog, {
      status: 'failed',
      processedAt: new Date(),
      errorMessage: dbError.message,
      ...compactUpdates(eventMeta),
    });
    return res.status(500).json({ error: 'Erro interno.' });
  }

  await updateStripeEventLog(eventLog, {
    status: eventStatus,
    processedAt: new Date(),
    errorMessage,
    ...compactUpdates(eventMeta),
  });

  if (eventStatus === 'failed') {
    console.warn(`[stripe] Webhook ${event.type} falhou: ${errorMessage || 'erro desconhecido'}`);
    return res.status(500).json({ error: errorMessage || 'Webhook processing failed.' });
  }

  res.json({ received: true, status: eventStatus });
};
