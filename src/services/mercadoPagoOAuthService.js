const axios = require('axios');
const crypto = require('crypto');
const { User } = require('../models');
const logger = require('../utils/logger');

const AUTH_BASE_URL = 'https://auth.mercadopago.com/authorization';
const TOKEN_URL = 'https://api.mercadopago.com/oauth/token';
const STATE_TTL_MS = Number(process.env.MP_OAUTH_STATE_TTL_MS || 10 * 60 * 1000); // padrão: 10 minutos

function getRedirectUri() {
  if (process.env.MP_OAUTH_REDIRECT_URI) {
    return process.env.MP_OAUTH_REDIRECT_URI;
  }
  const serverUrl = (process.env.SERVER_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${serverUrl}/api/integrations/mercadopago/oauth/callback`;
}

function getStateSecret() {
  return (
    process.env.MP_OAUTH_STATE_SECRET ||
    process.env.JWT_SECRET ||
    process.env.MP_CLIENT_SECRET ||
    null
  );
}

function assertStateSecret() {
  const secret = getStateSecret();
  if (!secret) {
    throw new Error('MP_OAUTH_STATE_SECRET ou JWT_SECRET devem estar configurados para validar o state do OAuth.');
  }
  return secret;
}

function signStatePayload(payload, secret) {
  const data = `${payload.uid}:${payload.nonce}:${payload.ts}`;
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

function buildStateParam(userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid)) {
    throw new Error('Identificador de usuário inválido para o state do OAuth Mercado Pago.');
  }
  const secret = assertStateSecret();
  const payload = {
    uid,
    nonce: crypto.randomUUID(),
    ts: Date.now(),
  };
  const signature = signStatePayload(payload, secret);
  const encoded = Buffer.from(JSON.stringify({ ...payload, sig: signature })).toString('base64url');
  return encoded;
}

function parseState(state) {
  if (!state) return null;
  try {
    const decoded = JSON.parse(Buffer.from(String(state), 'base64url').toString('utf8'));
    const { uid, nonce, ts, sig } = decoded || {};
    if (uid === undefined || !nonce || !ts || !sig) {
      return null;
    }
    const payload = {
      uid: Number(uid),
      nonce: String(nonce),
      ts: Number(ts),
    };
    if (!Number.isFinite(payload.uid) || Number.isNaN(payload.ts)) {
      return null;
    }
    const secret = assertStateSecret();
    const expected = signStatePayload(payload, secret);
    if (
      expected.length !== String(sig).length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(sig)))
    ) {
      return null;
    }
    if (STATE_TTL_MS > 0 && Date.now() - payload.ts > STATE_TTL_MS) {
      logger.warn('mercadopago.oauth.state_expired', { uid: payload.uid, ts: payload.ts });
      return null;
    }
    return { userId: payload.uid, nonce: payload.nonce, issuedAt: payload.ts };
  } catch (error) {
    logger.warn('mercadopago.oauth.state_invalid', { error: error.message });
    return null;
  }
}

function getAuthorizationUrl(userId, options = {}) {
  const clientId = process.env.MP_CLIENT_ID;
  if (!clientId) {
    throw new Error('MP_CLIENT_ID não configurado.');
  }

  const redirectUri = options.redirectUri || getRedirectUri();
  const scope = options.scope || 'offline_access read write';
  const state = options.state || buildStateParam(userId);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    platform_id: 'mp',
    redirect_uri: redirectUri,
    state,
    scope,
  });

  if (options.prompt) {
    params.append('prompt', options.prompt);
  }

  return `${AUTH_BASE_URL}?${params.toString()}`;
}

function formUrlEncode(payload) {
  const params = new URLSearchParams();
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  });
  return params.toString();
}

async function exchangeCodeForTokens(code, options = {}) {
  if (!code) {
    throw new Error('Código de autorização ausente.');
  }

  const clientId = process.env.MP_CLIENT_ID;
  const clientSecret = process.env.MP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Credenciais da aplicação Mercado Pago não configuradas.');
  }

  const redirectUri = options.redirectUri || getRedirectUri();

  const payload = formUrlEncode({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const { data } = await axios.post(TOKEN_URL, payload, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return data;
}

async function refreshAccessToken(user) {
  if (!user?.mpRefreshToken) {
    throw new Error('Refresh token Mercado Pago não encontrado.');
  }

  const clientId = process.env.MP_CLIENT_ID;
  const clientSecret = process.env.MP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Credenciais da aplicação Mercado Pago não configuradas.');
  }

  const payload = formUrlEncode({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: user.mpRefreshToken,
  });

  try {
    const { data } = await axios.post(TOKEN_URL, payload, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    await persistTokens(user, data);
    logger.audit('mercadopago.oauth.refresh_success', {
      businessId: user.id,
      mpUserId: data.user_id || user.mpUserId,
    });
    return user;
  } catch (error) {
    logger.error('mercadopago.oauth.refresh_failed', {
      businessId: user.id,
      error: error.response?.data || error.message,
    });
    throw error;
  }
}

function computeExpiry(expiresInSeconds) {
  const buffer = 300; // 5 minutos
  const effective = Math.max(expiresInSeconds - buffer, 60);
  return new Date(Date.now() + effective * 1000);
}

async function persistTokens(user, tokenPayload) {
  if (!tokenPayload?.access_token) {
    throw new Error('Resposta inválida do Mercado Pago (access_token ausente).');
  }

  const updates = {
    mpAccessToken: tokenPayload.access_token,
    mpRefreshToken: tokenPayload.refresh_token || user.mpRefreshToken || null,
    mpUserId: tokenPayload.user_id ? String(tokenPayload.user_id) : user.mpUserId || null,
    mpTokenExpiresAt: tokenPayload.expires_in ? computeExpiry(Number(tokenPayload.expires_in)) : null,
  };

  await user.update(updates);
  return user;
}

function isTokenExpired(user, thresholdSeconds = 120) {
  if (!user?.mpAccessToken || !user?.mpTokenExpiresAt) {
    return true;
  }
  const expiresAt = new Date(user.mpTokenExpiresAt).getTime();
  if (Number.isNaN(expiresAt)) {
    return true;
  }
  return Date.now() + thresholdSeconds * 1000 >= expiresAt;
}

async function ensureValidAccessToken(user) {
  if (!user?.mpAccessToken) {
    throw new Error('Empresa não possui token do Mercado Pago configurado.');
  }
  if (!isTokenExpired(user)) {
    return user;
  }
  return refreshAccessToken(user);
}

module.exports = {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  ensureValidAccessToken,
  persistTokens,
  parseState,
  buildStateParam,
  getRedirectUri,
};
