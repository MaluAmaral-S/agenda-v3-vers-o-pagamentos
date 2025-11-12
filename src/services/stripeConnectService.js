const Stripe = require('stripe');
const { User } = require('../models');

let stripeClient;
const MOCK_ACCOUNT_PREFIX = 'mock_acc_';
const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';
const enableMockFallback = String(process.env.STRIPE_CONNECT_MOCK_FALLBACK || 'false').toLowerCase() === 'true';

function getStripeClient() {
  if (stripeClient) {
    return stripeClient;
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error('STRIPE_SECRET_KEY não configurada.');
  }

  stripeClient = new Stripe(secret);
  return stripeClient;
}

const isConnectNotEnabledError = (error) => {
  if (!error) return false;
  const message = error.message || error.raw?.message || '';
  return (
    error.type === 'StripeInvalidRequestError' &&
    /signed up for connect/i.test(message)
  );
};

const isMockAccountId = (accountId) =>
  typeof accountId === 'string' && accountId.startsWith(MOCK_ACCOUNT_PREFIX);

const buildMockAccount = (user) => {
  const baseId = user?.stripeAccountId && isMockAccountId(user.stripeAccountId)
    ? user.stripeAccountId
    : `${MOCK_ACCOUNT_PREFIX}${user?.id || Date.now()}`;

  return {
    id: baseId,
    charges_enabled: Boolean(user?.stripeChargesEnabled ?? false),
    payouts_enabled: Boolean(user?.stripePayoutsEnabled ?? false),
    details_submitted: Boolean(user?.stripeDetailsSubmitted ?? false),
  };
};

function extractAccountStatus(account) {
  if (!account) {
    return {};
  }

  return {
    stripeAccountId: account.id || null,
    stripeChargesEnabled: Boolean(account.charges_enabled),
    stripePayoutsEnabled: Boolean(account.payouts_enabled),
    stripeDetailsSubmitted: Boolean(account.details_submitted),
  };
}

async function persistAccountStatus(user, account) {
  const status = extractAccountStatus(account);
  await user.update(status);
  return status;
}

async function createExpressAccount(user) {
  const params = {
    type: 'express',
    country: process.env.STRIPE_CONNECT_COUNTRY || 'BR',
    email: user.email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
      boleto_payments: { requested: true },
      pix_payments: { requested: true },
    },
    metadata: {
      userId: user.id,
      businessName: user.businessName || undefined,
    },
  };

  try {
    const stripe = getStripeClient();
    const account = await stripe.accounts.create(params);
    const status = await persistAccountStatus(user, account);
    return { account, status, isMock: false };
  } catch (error) {
    if (
      enableMockFallback &&
      !isProduction &&
      (isConnectNotEnabledError(error) || /STRIPE_SECRET_KEY/i.test(error?.message || ''))
    ) {
      console.warn(
        '[stripe-connect] Connect não habilitado neste ambiente. Gerando conta simulada.'
      );
      const account = buildMockAccount(user);
      const status = await persistAccountStatus(user, account);
      return { account, status, isMock: true };
    }
    throw error;
  }
}

async function retrieveAccount(accountId) {
  if (!accountId) {
    return null;
  }
  const stripe = getStripeClient();
  try {
    return await stripe.accounts.retrieve(accountId);
  } catch (error) {
    if (error?.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

async function getOrCreateAccount(user) {
  let account = null;

  if (user.stripeAccountId) {
    if (isMockAccountId(user.stripeAccountId)) {
      if (enableMockFallback && !isProduction) {
        account = buildMockAccount(user);
      } else {
        account = null;
      }
    } else {
      account = await retrieveAccount(user.stripeAccountId);
    }
  }

  if (!account) {
    const created = await createExpressAccount(user);
    return created;
  }

  const status = await persistAccountStatus(user, account);
  return { account, status, isMock: isMockAccountId(account.id) };
}

async function generateOnboardingLink(user, options = {}) {
  const { account, isMock } = await getOrCreateAccount(user);

  const base = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  const refreshUrl = options.refreshUrl || `${base}/integracoes/stripe?step=retry`;
  const returnUrl = options.returnUrl || `${base}/integracoes/stripe?step=done`;

  if (enableMockFallback && isMockAccountId(account.id) && !isProduction) {
    return {
      url: returnUrl,
      accountId: account.id,
      isMock: true,
      message:
        'Stripe Connect não está habilitado. Fluxo de onboarding simulado para desenvolvimento.',
      expiresAt: null,
    };
  }

  const stripe = getStripeClient();
  const link = await stripe.accountLinks.create({
    account: account.id,
    type: 'account_onboarding',
    refresh_url: refreshUrl,
    return_url: returnUrl,
  });

  return {
    url: link.url,
    expiresAt: link.expires_at ? new Date(link.expires_at * 1000).toISOString() : null,
    accountId: account.id,
    isMock: Boolean(isMockAccountId(account.id)),
  };
}

async function refreshAccountStatus(user) {
  if (!user.stripeAccountId) {
    return null;
  }

  if (enableMockFallback && isMockAccountId(user.stripeAccountId) && !isProduction) {
    const account = buildMockAccount(user);
    const status = await persistAccountStatus(user, account);
    return { account, status, isMock: true };
  }

  const account = await retrieveAccount(user.stripeAccountId);
  if (!account) {
    return null;
  }
  const status = await persistAccountStatus(user, account);
  return { account, status, isMock: isMockAccountId(account.id) };
}

async function loadUserById(userId) {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new Error('Usuário não encontrado.');
  }
  return user;
}

module.exports = {
  getStripeClient,
  extractAccountStatus,
  createExpressAccount,
  getOrCreateAccount,
  generateOnboardingLink,
  refreshAccountStatus,
  loadUserById,
  isMockAccountId,
};
