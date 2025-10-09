const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { User, Subscription, Plan } = require('../models');
const { getSubscriptionDurationDays } = require('../config/planConfig');

/**
 * Modo debug: permite processar eventos sem verificação de assinatura (NÃO use em produção).
 * STRIPE_ALLOW_UNVERIFIED_WEBHOOKS=true
 */
const ALLOW_UNVERIFIED = String(process.env.STRIPE_ALLOW_UNVERIFIED_WEBHOOKS || '').toLowerCase() === 'true';

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

exports.createCheckoutSession = async (req, res) => {
  const planInput = req.body.planKey ?? req.body.planId;
  const userId = req.user?.userId || req.user?.id;
  try {
    const resolved = resolvePlanFromInput(planInput);
    if (!resolved) return res.status(404).json({ error: 'Plano não encontrado.' });

    const priceId = getPriceIdForPlan(resolved.displayName);
    if (!priceId) return res.status(400).json({ error: 'ID de preço do Stripe não configurado.' });

    const user = await User.findByPk(userId);
    const existing = await Subscription.findOne({ where: { userId } });
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

    return res.json({ url: session.url });
  } catch (e) {
    console.error('Erro ao criar sessão de checkout:', e);
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

  try {
    if (ALLOW_UNVERIFIED) {
      // Modo debug: sem verificação de assinatura
      event = JSON.parse(req.body.toString('utf8'));
      console.log('⚠️  [Stripe] webhook em modo NÃO verificado.');
    } else {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
      console.log('✅ [Stripe] webhook verificado:', event.type);
    }
  } catch (err) {
    console.log(`❌ Erro na verificação do webhook: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      // NOVO CÓDIGO para o case 'checkout.session.completed'

      case 'checkout.session.completed': {
        const session = event.data.object;
        const { userId, planKey } = session.metadata || {};
        const stripeSubscriptionId = session.subscription;
        const stripeCustomerId = session.customer;

        // Validação inicial para garantir que temos os dados mínimos
        if (!userId || !planKey || !stripeSubscriptionId || !stripeCustomerId) {
          console.error('❌ Webhook "checkout.session.completed" com metadata incompleto:', session.metadata);
          break; // Sai do case se os dados essenciais estiverem em falta
        }

        // 1. Resolve o ID do plano a partir da nossa base de dados
        const finalPlanId = await resolvePlanIdFromMetadata(planKey);
        if (!finalPlanId) {
          console.error('❌ Webhook: não foi possível resolver o planId a partir da metadata:', session.metadata);
          break;
        }

                // 2. Obtém a data de fim do período do Stripe de forma segura
        let currentPeriodEnd;
        try {
          const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
          // VERIFICAÇÃO ADICIONADA: Só usa a data do Stripe se for um número válido
          if (stripeSub && typeof stripeSub.current_period_end === 'number') {
            currentPeriodEnd = new Date(stripeSub.current_period_end * 1000);
          } else {
            throw new Error('current_period_end ausente ou inválido na assinatura do Stripe.');
          }
        } catch (e) {
          console.warn(`⚠️ Aviso ao buscar dados da assinatura no Stripe: ${e.message}. Usando fallback.`);
          // Como fallback, define uma duração padrão
          const days = getSubscriptionDurationDays();
          currentPeriodEnd = new Date(new Date().getTime() + days * 24 * 60 * 60 * 1000);
        }

        // 3. Lógica "Upsert": tenta encontrar e atualizar; se não encontrar, cria.
        const subscriptionData = {
          planId: finalPlanId,
          status: 'active',
          expiresAt: currentPeriodEnd, // Agora garantidamente uma data válida
          stripeSubscriptionId: stripeSubscriptionId,
          stripeCustomerId: stripeCustomerId,
        };


        // Procura uma assinatura existente para o utilizador
        const existingSubscription = await Subscription.findOne({ where: { userId: userId } });

        if (existingSubscription) {
          // Se já existe, ATUALIZA
          await existingSubscription.update(subscriptionData);
          console.log(`✅ Assinatura ATUALIZADA para o userId=${userId}`);
        } else {
          // Se não existe, CRIA uma nova com a data de início
          await Subscription.create({
            ...subscriptionData,
            userId: userId,
            startsAt: new Date(), // A data de início só é definida na criação
          });
          console.log(`✅ Nova assinatura CRIADA para o userId=${userId}`);
        }

        console.log(`🎉 Plano distribuído com sucesso (userId=${userId}, planId=${finalPlanId}).`);
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const stripeSubscription = event.data.object;
        const subscription = await Subscription.findOne({ where: { stripeSubscriptionId: stripeSubscription.id } });
        if (subscription) {
          await subscription.update({
            status: stripeSubscription.status,
            stripePriceId: stripeSubscription.items?.data?.[0]?.price?.id,
            currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
            expiresAt: new Date(stripeSubscription.current_period_end * 1000),
          });
          console.log(`✅ Assinatura ${stripeSubscription.id} atualizada para status ${stripeSubscription.status}`);
        }
        break;
      }
      default:
        console.log(`Evento não tratado do tipo ${event.type}`);
    }
  } catch (dbError) {
    console.error('Erro no banco ao processar webhook:', dbError);
    return res.status(500).json({ error: 'Erro interno.' });
  }

  res.json({ received: true });
};
