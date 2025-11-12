const { Plan, Subscription, User } = require('../models');
const callMercadoPagoAPI = require('../lib/mercadoPagoApi');
const { getSubscriptionDurationDays } = require('../config/planConfig');

const ACTIVATION_ACTIONS = new Set([
  'subscription_preapproval_authorized',
  'authorized_payment',
  'payment_authorized',
  'payment.created',
]);

const ACTIVE_STATUSES = new Set(['authorized', 'active', 'approved', 'processed', 'completed']);
const CANCELLATION_STATUSES = new Set(['paused', 'cancelled', 'canceled', 'deactivated']);

async function createPlan(req, res) {
  try {
    const { key, name, price, frequency, frequencyType } = req.body;
    if (!key || !name || !price) {
      return res.status(400).json({ error: 'Informe key, name e price do plano.' });
    }

    const normalizedKey = String(key).toLowerCase();
    const existing = await Plan.findOne({ where: { key: normalizedKey } });
    if (existing && existing.mpPlanId) {
      return res.status(409).json({ error: 'Plano ja existe e possui vinculacao no Mercado Pago.' });
    }

    const freq = Number(frequency) || 1;
    const freqType = frequencyType || 'months';

    const payload = {
      reason: name,
      auto_recurring: {
        frequency: freq,
        frequency_type: freqType,
        transaction_amount: Number(price),
        currency_id: 'BRL',
      },
    };

    const mpResponse = await callMercadoPagoAPI('POST', '/v1/plans', payload);
    const mpPlanId = mpResponse && mpResponse.id;
    if (!mpPlanId) {
      return res.status(500).json({ error: 'Falha ao criar plano no Mercado Pago.' });
    }

    let plan;
    if (existing) {
      plan = existing;
      await plan.update({ mpPlanId });
    } else {
      plan = await Plan.create({
        key: normalizedKey,
        name,
        monthlyLimit: 0,
        mpPlanId,
      });
    }

    return res.status(201).json({
      message: 'Plano criado com sucesso.',
      plan: {
        id: plan.id,
        key: plan.key,
        name: plan.name,
        mpPlanId: plan.mpPlanId,
      },
      mercadoPago: mpResponse,
    });
  } catch (error) {
    console.error('Erro ao criar plano Mercado Pago:', error);
    return res.status(500).json({ error: error.message || 'Erro ao criar plano.' });
  }
}

async function createSubscription(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Usuario nao autenticado.' });
    }

    const { planKey } = req.body;
    if (!planKey) {
      return res.status(422).json({ error: 'Informe o identificador do plano.' });
    }

    const normalizedKey = String(planKey).toLowerCase();
    const plan = await Plan.findOne({ where: { key: normalizedKey } });
    if (!plan || !plan.mpPlanId) {
      return res.status(404).json({ error: 'Plano nao encontrado ou nao vinculado ao Mercado Pago.' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(401).json({ error: 'Usuario nao encontrado.' });
    }

    const payload = {
      plan_id: plan.mpPlanId,
      payer: { email: user.email },
    };

    const mpResponse = await callMercadoPagoAPI('POST', '/v1/subscriptions', payload);
    const mpSubscriptionId = mpResponse && mpResponse.id;
    const checkoutUrl = mpResponse && (mpResponse.init_point || mpResponse.init_url);
    if (!mpSubscriptionId || !checkoutUrl) {
      return res.status(500).json({ error: 'Falha ao criar assinatura no Mercado Pago.' });
    }

    await Subscription.update(
      { status: 'canceled', expiresAt: new Date() },
      { where: { userId, status: 'active' } },
    );

    const subscription = await Subscription.create({
      userId,
      planId: plan.id,
      mpPlanId: plan.mpPlanId,
      mpSubscriptionId,
      status: 'pending',
    });

    return res.status(201).json({
      message: 'Assinatura criada. Redirecione o usuario para concluir o pagamento.',
      checkoutUrl,
      subscription: {
        id: subscription.id,
        mpSubscriptionId,
        status: subscription.status,
      },
    });
  } catch (error) {
    console.error('Erro ao criar assinatura Mercado Pago:', error);
    return res.status(500).json({ error: error.message || 'Erro ao criar assinatura.' });
  }
}

function shouldActivateFromPayload(body, remoteStatus) {
  const action = String(body?.action || '').toLowerCase();
  if (ACTIVATION_ACTIONS.has(action)) {
    return true;
  }
  if (ACTIVE_STATUSES.has(remoteStatus)) {
    return true;
  }
  return false;
}

function normalizeCycleDates(subscriptionData, subscription, forceActivation) {
  let startsAt = subscription.startsAt || null;
  let expiresAt = subscription.expiresAt || null;

  if (subscriptionData?.current_period_start_date) {
    startsAt = new Date(subscriptionData.current_period_start_date);
  }
  if (subscriptionData?.current_period_end_date) {
    expiresAt = new Date(subscriptionData.current_period_end_date);
  }

  if (forceActivation) {
    if (!startsAt) {
      startsAt = new Date();
    }
    if (!expiresAt && startsAt) {
      const days = getSubscriptionDurationDays();
      expiresAt = new Date(startsAt.getTime() + days * 24 * 60 * 60 * 1000);
    }
  }

  return { startsAt, expiresAt };
}

async function handleWebhook(req, res) {
  try {
    const body = req.body || {};
    let mpSubscriptionId = body?.data?.id || body?.data?.subscription_id || body?.data?.preapproval_id || body?.id || body?.subscription_id || null;

    if (!mpSubscriptionId) {
      console.warn('Webhook recebido sem id de assinatura:', body);
      return res.status(200).send('OK');
    }

    const subscriptionData = await callMercadoPagoAPI('GET', `/v1/subscriptions/${mpSubscriptionId}`);
    const remoteStatus = String(subscriptionData?.status || '').toLowerCase();

    const subscription = await Subscription.findOne({ where: { mpSubscriptionId } });
    if (!subscription) {
      console.warn(`Webhook para assinatura desconhecida ${mpSubscriptionId}`);
      return res.status(200).send('OK');
    }

    let nextStatus = subscription.status;
    const activate = shouldActivateFromPayload(body, remoteStatus);

    if (activate) {
      nextStatus = 'active';
    } else if (CANCELLATION_STATUSES.has(remoteStatus)) {
      nextStatus = 'canceled';
    }

    const { startsAt, expiresAt } = normalizeCycleDates(subscriptionData, subscription, activate);

    await subscription.update({
      status: nextStatus,
      startsAt,
      expiresAt,
    });

    console.log(`[mercadopago] assinatura ${mpSubscriptionId} atualizada para ${nextStatus}`);
    return res.status(200).send('OK');
  } catch (error) {
    console.error('Erro ao processar webhook Mercado Pago:', error);
    return res.status(500).send('Erro ao processar webhook');
  }
}

module.exports = {
  createPlan,
  createSubscription,
  handleWebhook,
};
