const { Op } = require('sequelize');
const { Subscription, Plan, Appointment } = require('../models');
const { getPlanLimit, getSubscriptionDurationDays } = require('../config/planConfig');

// Funções auxiliares
const diffInDays = (end, start) => {
  if (!end || !start) return null;
  const oneDayMs = 24 * 60 * 60 * 1000;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(Math.ceil(diff / oneDayMs), 0);
};

const countUsage = async (userId, startsAt, expiresAt) => {
  if (!userId || !startsAt || !expiresAt) return 0;
  return Appointment.count({
    where: {
      userId,
      status: { [Op.in]: ['pending', 'confirmed', 'rescheduled'] },
      createdAt: { [Op.gte]: startsAt, [Op.lt]: expiresAt },
    },
  });
};

const addDays = (date, amount) => {
  const base = date instanceof Date ? date : new Date(date);
  const ms = Number(amount) * 24 * 60 * 60 * 1000;
  return new Date(base.getTime() + ms);
};

const createSubscription = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    const { planKey } = req.body;

    if (!planKey || typeof planKey !== 'string') {
      return res.status(422).json({ error: 'Informe o plano desejado.' });
    }

    const normalizedKey = planKey.toLowerCase();

    const plan = await Plan.findOne({ where: { key: normalizedKey, isActive: true } });

    if (!plan) {
      return res.status(404).json({ error: 'Plano não encontrado.' });
    }

    await Subscription.update(
      { status: 'canceled', expiresAt: new Date() },
      { where: { userId, status: 'active' } }
    );

    const now = new Date();
    const duration = getSubscriptionDurationDays();
    const expiresAt = addDays(now, duration);

    const subscription = await Subscription.create({
      userId,
      planId: plan.id,
      startsAt: now,
      expiresAt,
      status: 'active',
    });

    return res.status(201).json({
      message: 'Assinatura confirmada (simulação).',
      subscription: {
        id: subscription.id,
        startsAt: subscription.startsAt,
        expiresAt: subscription.expiresAt,
        status: subscription.status,
      },
      plan: {
        key: plan.key,
        name: plan.name,
        monthlyLimit: getPlanLimit(plan.key, plan.monthlyLimit),
      },
    });
  } catch (error) {
    console.error('Erro ao criar assinatura:', error);
    return res.status(500).json({ error: 'Erro ao criar assinatura.' });
  }
};

const getMySubscription = async (req, res) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    const subscription = await Subscription.findOne({
      where: { userId, status: 'active' },
      include: [{ model: Plan, as: 'plan' }],
      order: [['startsAt', 'DESC']],
    });

    if (!subscription) {
      return res.json({ hasActive: false });
    }

    const now = new Date();
    const expiresAt = new Date(subscription.expiresAt);

    if (expiresAt <= now) {
      await subscription.update({ status: 'expired' });
      return res.json({ hasActive: false });
    }

    const startsAt = new Date(subscription.startsAt);
    const limit = getPlanLimit(subscription.plan?.key, subscription.plan?.monthlyLimit);
    const used = await countUsage(userId, startsAt, expiresAt);

    return res.json({
      hasActive: true,
      plan: {
        key: subscription.plan?.key,
        name: subscription.plan?.name,
        monthlyLimit: limit,
      },
      subscription: {
        startsAt: subscription.startsAt,
        expiresAt: subscription.expiresAt,
        status: subscription.status,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        stripeCustomerId: subscription.stripeCustomerId,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd),
        daysLeft: diffInDays(expiresAt, now),
      },
      usage: {
        used,
        remaining: limit ? Math.max(limit - used, 0) : null,
        limit,
      },
    });
  } catch (error) {
    console.error('Erro ao buscar assinatura:', error);
    return res.status(500).json({ error: 'Erro ao buscar assinatura.' });
  }
};

/**
 * Novo: retorna a assinatura com possíveis campos do Stripe já gravados via webhook.
 */
const getSubscription = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    const subscription = await Subscription.findOne({
      where: { userId },
      include: [{ model: Plan, as: 'plan', required: false }], // Tenta incluir o plano
      order: [['createdAt', 'DESC']],
    });

    // Se não houver registo de assinatura
    if (!subscription) {
      return res.json({ hasActive: false, message: 'Nenhuma assinatura encontrada.' });
    }

    // PROTEÇÃO ANTI-CRASH: Se a assinatura existe mas o plano não (dados órfãos)
    if (!subscription.plan) {
      console.error(`🔥🔥 ERRO DE DADOS: Assinatura ID ${subscription.id} (userId: ${userId}) tem um planId inválido/órfão.`);
      return res.status(404).json({ hasActive: false, message: 'Assinatura com plano inválido.' });
    }

    const now = new Date();
    const expiresAt = new Date(subscription.expiresAt);

    // Se a assinatura estiver inativa por status ou data
    if (['canceled', 'expired', 'unpaid'].includes(subscription.status) || expiresAt <= now) {
      if (subscription.status === 'active') await subscription.update({ status: 'expired' });
      return res.json({ hasActive: false, message: 'Assinatura não está ativa.' });
    }

    // Se tudo estiver correto, monta a resposta completa
    const startsAt = new Date(subscription.startsAt);
    const limit = getPlanLimit(subscription.plan.key, subscription.plan.monthlyLimit);
    const used = await countUsage(userId, startsAt, expiresAt);
    const remaining = typeof limit === 'number' ? Math.max(limit - used, 0) : null;

    return res.json({
      hasActive: true,
      plan: { key: subscription.plan.key, name: subscription.plan.name, monthlyLimit: limit },
      subscription: {
        startsAt,
        expiresAt,
        status: subscription.status,
        daysLeft: diffInDays(expiresAt, now),
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        stripeCustomerId: subscription.stripeCustomerId,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd),
      },
      usage: { used, remaining, limit },
    });

  } catch (error) {
    console.error('🔥🔥🔥 ERRO GRAVE NO CONTROLLER DE ASSINATURA (getSubscription) 🔥🔥🔥', error);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};

module.exports = {
  createSubscription,
  getMySubscription,
  getSubscription,
};
