const Stripe = require('stripe');
const { User, Subscription, Plan, StripeEvent } = require('../models');
const { getSubscriptionDurationDays } = require('../config/planConfig');

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

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.CLIENT_URL}/minha-assinatura?status=success`,
      cancel_url: `${process.env.CLIENT_URL}/planos?status=cancelled`,
      metadata: { userId, planKey: resolved.planKey },
    });

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

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const metadata = (session && session.metadata) ? session.metadata : {};
        const planKey = metadata.planKey || metadata.plan || null;
        const rawUserId = metadata.userId || metadata.userID || metadata.user_id || null;
        const userId = rawUserId ? Number(rawUserId) : null;
        const stripeSubscriptionId = session.subscription;
        const stripeCustomerId = session.customer;

        Object.assign(eventMeta, compactUpdates({
          userId,
          stripeCustomerId,
          stripeSubscriptionId,
          paymentStatus: 'paid',
        }));

        if (!userId || !planKey || !stripeSubscriptionId || !stripeCustomerId) {
          console.error('[stripe] checkout.session.completed com metadata incompleta:', metadata);
          eventStatus = 'ignored';
          errorMessage = 'Metadata incompleta para checkout.session.completed';
          break;
        }

        const finalPlanId = await resolvePlanIdFromMetadata(planKey);
        if (!finalPlanId) {
          console.error('[stripe] Plano nao encontrado para metadata:', metadata);
          eventStatus = 'ignored';
          errorMessage = 'Plano nao encontrado para metadata do checkout';
          break;
        }

        let currentPeriodEnd;
        try {
          const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
          if (stripeSub && typeof stripeSub.current_period_end === 'number') {
            currentPeriodEnd = new Date(stripeSub.current_period_end * 1000);
          } else {
            throw new Error('current_period_end ausente ou invalido na assinatura do Stripe.');
          }
        } catch (e) {
          console.warn(`[stripe] Aviso ao buscar dados da assinatura no Stripe: ${e.message}. Usando fallback.`);
          const days = getSubscriptionDurationDays();
          currentPeriodEnd = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        }

        const subscriptionData = {
          planId: finalPlanId,
          status: 'active',
          paymentStatus: 'paid',
          expiresAt: currentPeriodEnd,
          stripeSubscriptionId,
          stripeCustomerId,
        };

        const existingSubscription = await Subscription.findOne({ where: { userId } });

        if (existingSubscription) {
          await existingSubscription.update({
            ...subscriptionData,
            startsAt: existingSubscription.startsAt || new Date(),
          });
          console.log(`[stripe] Assinatura atualizada para o userId=${userId}`);
        } else {
          await Subscription.create({
            ...subscriptionData,
            userId,
            startsAt: new Date(),
          });
          console.log(`[stripe] Nova assinatura criada para o userId=${userId}`);
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

        await subscription.update({
          status: 'active',
          paymentStatus: 'paid',
          stripeCustomerId: stripeCustomerId || subscription.stripeCustomerId,
          stripePriceId: priceId || subscription.stripePriceId,
          startsAt,
          expiresAt,
        });

        console.log(`[stripe] Assinatura ${stripeSubscriptionId} ativada apos pagamento da fatura.`);
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
          });

          Object.assign(eventMeta, compactUpdates({ userId: subscription.userId }));
          console.log(`[stripe] Assinatura ${stripeSubscription.id} atualizada para status ${stripeSubscription.status}`);
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

  res.json({ received: true, status: eventStatus });
};






