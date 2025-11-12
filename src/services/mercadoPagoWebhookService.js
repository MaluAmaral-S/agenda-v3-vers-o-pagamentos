const crypto = require('crypto');
const JSONbig = require('json-bigint')({ storeAsString: true });
const { MercadoPagoWebhookEvent } = require('../models');
const logger = require('../utils/logger');

function parseSignatureHeader(signatureHeader) {
  if (!signatureHeader || typeof signatureHeader !== 'string') {
    return { ts: null, v1: null };
  }

  const parts = signatureHeader
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  let ts = null;
  let v1 = null;

  for (const chunk of parts) {
    const [rawKey, rawValue] = chunk.split('=');
    const key = rawKey?.trim();
    const value = rawValue?.trim();
    if (key === 'ts') {
      ts = value || null;
    }
    if (key === 'v1') {
      v1 = value || null;
    }
  }

  return { ts, v1 };
}

function extractResourceId(resource) {
  if (typeof resource !== 'string' || !resource.length) {
    return null;
  }
  const match = resource.match(/\/(\d+)(?:\?.*)?$/);
  if (match && match[1]) {
    return match[1];
  }
  const sanitized = resource.split('?')[0];
  const segments = sanitized.split('/').filter(Boolean);
  if (!segments.length) return null;
  const lastSegment = segments[segments.length - 1];
  return /^\d+$/.test(lastSegment) ? lastSegment : null;
}

function normalizeIdentifier(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    return raw.trim().length ? raw.trim() : null;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw);
  }
  if (typeof raw === 'bigint') {
    return raw.toString();
  }
  if (typeof raw === 'object' && typeof raw.toString === 'function') {
    const converted = raw.toString();
    return converted && converted !== '[object Object]' ? converted : null;
  }
  return String(raw);
}

function pickQueryValue(value) {
  if (Array.isArray(value)) {
    return value.length ? value[0] : null;
  }
  return value;
}

function resolveQuerySignedId(query = {}) {
  if (!query || typeof query !== 'object') {
    return null;
  }

  const candidates = [
    pickQueryValue(query['data.id']),
    pickQueryValue(query['data.id_url']),
    pickQueryValue(query?.data?.id),
    pickQueryValue(query?.data?.id_url),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeIdentifier(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function resolveSignedId(payload, query = {}) {
  if (!payload || typeof payload !== 'object') return null;
  const candidates = [
    payload?.data?.id,
    payload?.data?.payment_id,
    payload?.data?.payment?.id,
    payload?.data?.merchant_order_id,
    payload?.merchant_order_id,
    payload?.merchant_order?.id,
    payload?.order?.id,
    extractResourceId(payload?.resource),
    resolveQuerySignedId(query),
  ];
  for (const candidate of candidates) {
    const normalized = normalizeIdentifier(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function timingSafeEqualHex(expected, received) {
  if (!expected || !received) return false;
  if (expected.length !== received.length) return false;
  try {
    const expectedBuffer = Buffer.from(expected, 'hex');
    const receivedBuffer = Buffer.from(received, 'hex');
    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch (error) {
    logger.warn('mercadopago.webhook.signature_hex_invalid', { error: error.message });
    return false;
  }
}

function verifySignature({
  rawBody,
  signatureHeader,
  requestId,
  secret = process.env.MP_WEBHOOK_SECRET,
  query = {},
} = {}) {
  // Permitir desativar a verificacao de assinatura via variavel de ambiente. Util em
  // ambiente de desenvolvimento/local, onde o Mercado Pago pode nao enviar
  // o cabecalho x-signature. Ao habilitar MP_WEBHOOK_DISABLE_SIGNATURE_VALIDATION=true,
  // a assinatura sera considerada valida sempre.
  const skip = process.env.MP_WEBHOOK_DISABLE_SIGNATURE_VALIDATION === 'true';
  if (skip) {
    logger.warn('mercadopago.webhook.signature_skipped', {
      reason: 'MP_WEBHOOK_DISABLE_SIGNATURE_VALIDATION=true',
    });
    return true;
  }

  if (!secret) {
    logger.error('mercadopago.webhook.secret_missing');
    return false;
  }

  const { ts, v1 } = parseSignatureHeader(signatureHeader);
  if (!ts || !v1) {
    logger.warn('mercadopago.webhook.signature_params_missing', {
      signatureHeader: signatureHeader || null,
    });
    return false;
  }

  if (!requestId) {
    logger.warn('mercadopago.webhook.request_id_missing');
    return false;
  }

  const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || '');
  let payload;
  try {
    payload = bodyBuffer.length ? JSONbig.parse(bodyBuffer.toString('utf8')) : {};
  } catch (error) {
    logger.error('mercadopago.webhook.payload_parse_failed', { error: error.message });
    return false;
  }

  const eventType = payload?.type || payload?.topic || payload?.action || null;
  const canonicalId = resolveSignedId(payload, query);
  if (!canonicalId) {
    logger.warn('mercadopago.webhook.data_id_missing', { eventType });
    return false;
  }

  const signatureString = `id:${canonicalId.toString()};request-id:${requestId};ts:${ts};`;
  const digest = crypto.createHmac('sha256', secret).update(signatureString).digest('hex');
  const received = String(v1);

  // Log prefixos da digest e da assinatura recebida para facilitar debug sem
  // expor todo o valor. Nao logamos o valor completo por seguranca.
  logger.info('mercadopago.webhook.signature_computed', {
    ts,
    digest_prefix: digest.slice(0, 8),
    received_prefix: received.slice(0, 8),
    body_length: bodyBuffer.length,
    signature_preview: signatureString,
  });

  const valid = timingSafeEqualHex(digest, received);
  if (!valid) {
    logger.warn('mercadopago.webhook.invalid_signature', {
      signature: signatureHeader || null,
    });
  }
  return valid;
}

async function recordIncomingEvent(payload) {
  const notificationId = payload?.id ? String(payload.id) : null;
  const dataId = payload?.data?.id ? String(payload.data.id) : null;
  if (!notificationId) {
    throw new Error('Payload de webhook inválido – id ausente.');
  }

  const defaults = {
    notificationId,
    topic: payload.topic || payload.type || null,
    eventType: payload.type || null,
    dataId,
    status: 'received',
    payload,
  };

  const [event, created] = await MercadoPagoWebhookEvent.findOrCreate({
    where: { notificationId },
    defaults,
  });

  if (!created) {
    logger.info('mercadopago.webhook.duplicate', { notificationId, dataId });
    if (event.status === 'processed') {
      return { event, duplicate: true };
    }
    await event.update({
      payload,
      topic: defaults.topic,
      eventType: defaults.eventType,
      dataId: defaults.dataId,
      status: 'received',
    });
  }

  return { event, duplicate: false };
}

async function markProcessed(event, result = {}) {
  if (!event) return;
  const updates = {
    status: result.error ? 'failed' : 'processed',
    processedAt: new Date(),
  };
  if (result.error) {
    updates.errorMessage = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
  }
  if (result.businessId) {
    updates.businessId = result.businessId;
  }
  await event.update(updates);
}

module.exports = {
  verifySignature,
  recordIncomingEvent,
  markProcessed,
};
