const { User } = require('../models');
const logger = require('../utils/logger');
const {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  persistTokens,
  parseState,
  getRedirectUri,
} = require('../services/mercadoPagoOAuthService');

function buildRedirectUrl(status, message) {
  const base = process.env.CLIENT_URL || 'http://localhost:5173';
  const url = new URL(base);
  url.pathname = '/painel';
  url.searchParams.set('tab', 'pagamentos');
  url.searchParams.set('status', status);
  if (message) url.searchParams.set('message', message);
  return url.toString();
}

exports.getConnectUrl = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Usuário não autenticado.' });
    }

    const url = getAuthorizationUrl(userId);
    logger.audit('mercadopago.oauth.connect_url.generated', { userId });
    return res.json({ url });
  } catch (error) {
    logger.error('mercadopago.oauth.connect_url_failed', { error: error.message });
    return res.status(500).json({ message: 'Não foi possível iniciar a autorização no Mercado Pago.' });
  }
};

exports.getStatus = async (req, res) => {
  try {
    const businessUser = req.businessUser || (req.user?.id ? await User.findByPk(req.user.id) : null);
    if (!businessUser) {
      return res.status(401).json({ message: 'Usuário não autenticado.' });
    }

    return res.json({
      connected: Boolean(businessUser.mpAccessToken),
      mpUserId: businessUser.mpUserId || null,
      tokenExpiresAt: businessUser.mpTokenExpiresAt || null,
      paymentsEnabled: Boolean(businessUser.paymentsEnabled),
    });
  } catch (error) {
    logger.error('mercadopago.oauth.status_failed', { error: error.message });
    return res.status(500).json({ message: 'Não foi possível obter o status da integração Mercado Pago.' });
  }
};

function extractCallbackParams(req) {
  const container = { ...(req.query || {}) };
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    Object.assign(container, req.body);
  }
  return container;
}

exports.handleOAuthCallback = async (req, res) => {
  const params = extractCallbackParams(req);
  const { code, state, error, error_description: errorDescription } = params;

  // Log de diagnóstico para callbacks do OAuth. Inclui path, query
  // (code, state) e método. Não expomos o conteúdo completo do code/state em
  // logs para evitar vazamento de dados sensíveis.
  logger.info('mercadopago.oauth.callback.received', {
    method: req.method,
    path: req.originalUrl || req.url,
    hasCode: !!code,
    hasState: !!state,
  });

  if (error) {
    logger.warn('mercadopago.oauth.callback.error', { error, errorDescription });
    const redirectUrl = buildRedirectUrl('error', errorDescription || error);
    return res.redirect(redirectUrl);
  }

  if (!code) {
    logger.warn('mercadopago.oauth.callback.missing_code', params);
    return res.status(400).send('Código de autorização ausente.');
  }

  const parsedState = parseState(state);
  if (!parsedState?.userId) {
    logger.warn('mercadopago.oauth.callback.invalid_state', { state });
    return res.status(400).send('State inválido na autorização do Mercado Pago.');
  }

  // Log resultado da validação do state para auxiliar no diagnóstico de 401.
  logger.info('mercadopago.oauth.callback.state_validated', {
    userId: parsedState.userId,
    nonce: parsedState.nonce,
    issuedAt: parsedState.issuedAt,
  });

  try {
    const user = await User.findByPk(parsedState.userId);
    if (!user) {
      return res.status(404).send('Usuário não encontrado.');
    }

    const tokenPayload = await exchangeCodeForTokens(code, {
      redirectUri: getRedirectUri(),
    });
    await persistTokens(user, tokenPayload);

    logger.audit('mercadopago.oauth.callback.success', {
      userId: parsedState.userId,
      mpUserId: tokenPayload.user_id,
      nonce: parsedState.nonce,
    });

    const redirectUrl = buildRedirectUrl('success');
    if (req.method && req.method.toUpperCase() === 'POST') {
      return res.status(200).json({ redirectUrl, message: 'Conta Mercado Pago conectada.' });
    }
    return res.redirect(redirectUrl);
  } catch (err) {
    logger.error('mercadopago.oauth.callback.failed', {
      error: err.response?.data || err.message,
      stack: err.stack,
      state,
    });
    const redirectUrl = buildRedirectUrl('error', 'Falha ao conectar conta Mercado Pago.');
    if (req.method && req.method.toUpperCase() === 'POST') {
      return res.status(500).json({ message: 'Falha ao conectar conta Mercado Pago.' });
    }
    return res.redirect(redirectUrl);
  }
};
