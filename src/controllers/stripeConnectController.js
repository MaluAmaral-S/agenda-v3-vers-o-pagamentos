const {
  loadUserById,
  getOrCreateAccount,
  generateOnboardingLink,
  refreshAccountStatus,
  isMockAccountId,
} = require('../services/stripeConnectService');

const resolveCurrentUser = async (req) => {
  if (req.businessUser) {
    return req.businessUser;
  }
  const userId = req.user?.userId || req.user?.id;
  return loadUserById(userId);
};

const formatStatusResponse = (user, statusOverrides = {}) => {
  const source = {
    stripeAccountId: user.stripeAccountId || null,
    stripeChargesEnabled: Boolean(user.stripeChargesEnabled),
    stripePayoutsEnabled: Boolean(user.stripePayoutsEnabled),
    stripeDetailsSubmitted: Boolean(user.stripeDetailsSubmitted),
  };

  return {
    accountId: statusOverrides.stripeAccountId ?? source.stripeAccountId,
    chargesEnabled: statusOverrides.stripeChargesEnabled ?? source.stripeChargesEnabled,
    payoutsEnabled: statusOverrides.stripePayoutsEnabled ?? source.stripePayoutsEnabled,
    detailsSubmitted: statusOverrides.stripeDetailsSubmitted ?? source.stripeDetailsSubmitted,
  };
};

exports.createConnectAccount = async (req, res) => {
  try {
    const user = await resolveCurrentUser(req);

    const { account, status, isMock } = await getOrCreateAccount(user);
    const response = formatStatusResponse(user, status);

    return res.status(200).json({
      accountId: account.id,
      isMock: Boolean(isMock),
      status: response,
    });
  } catch (error) {
    console.error('[stripe-connect] Erro ao criar/obter conta conectada:', error);
    return res.status(500).json({ message: 'Falha ao criar a conta conectada.', error: error.message });
  }
};

exports.createOnboardingLink = async (req, res) => {
  try {
    const user = await resolveCurrentUser(req);

    const { refreshUrl, returnUrl } = req.body || {};
    const link = await generateOnboardingLink(user, {
      refreshUrl,
      returnUrl,
    });

    return res.status(200).json(link);
  } catch (error) {
    console.error('[stripe-connect] Erro ao gerar onboarding link:', error);
    return res.status(500).json({ message: 'Falha ao gerar o link de onboarding.', error: error.message });
  }
};

exports.getAccountStatus = async (req, res) => {
  try {
    const user = await resolveCurrentUser(req);
    const enableMockFallback = String(process.env.STRIPE_CONNECT_MOCK_FALLBACK || 'false').toLowerCase() === 'true';

    if (!user.stripeAccountId || (!enableMockFallback && isMockAccountId(user.stripeAccountId))) {
      return res.status(200).json({
        accountId: null,
        status: formatStatusResponse({ ...user, stripeAccountId: null, stripeChargesEnabled: false, stripePayoutsEnabled: false }),
      });
    }

    const refreshed = await refreshAccountStatus(user);
    const response = formatStatusResponse(user, refreshed ? refreshed.status : {});

    return res.status(200).json({
      accountId: response.accountId,
      isMock: Boolean(refreshed?.isMock),
      status: response,
    });
  } catch (error) {
    console.error('[stripe-connect] Erro ao consultar status da conta conectada:', error);
    return res.status(500).json({ message: 'Falha ao consultar status da conta conectada.', error: error.message });
  }
};
