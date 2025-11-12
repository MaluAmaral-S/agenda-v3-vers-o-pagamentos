const crypto = require('crypto');

describe('mercadoPagoWebhookService.verifySignature', () => {
  // eslint-disable-next-line global-require
  const { verifySignature } = require('../src/services/mercadoPagoWebhookService');
  const originalSecret = process.env.MP_WEBHOOK_SECRET;

  function callVerify(rawBody, headers, overrides = {}) {
    return verifySignature({
      rawBody,
      signatureHeader: headers['x-signature'],
      requestId: headers['x-request-id'],
      secret: process.env.MP_WEBHOOK_SECRET,
      ...overrides,
    });
  }

  afterAll(() => {
    process.env.MP_WEBHOOK_SECRET = originalSecret;
  });

  it('returns true for a valid Mercado Pago signature', () => {
    process.env.MP_WEBHOOK_SECRET = 'test_secret_key';
    const payload = { id: '123', type: 'payment', data: { id: '999' } };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const ts = Math.floor(Date.now() / 1000);
    const requestId = 'req-abc-123';
    const signatureString = `id:${payload.data.id};request-id:${requestId};ts:${ts};`;
    const digest = crypto.createHmac('sha256', process.env.MP_WEBHOOK_SECRET).update(signatureString).digest('hex');
    const headers = {
      'x-signature': `ts=${ts}, v1=${digest}`,
      'x-request-id': requestId,
    };

    const valid = callVerify(rawBody, headers);
    expect(valid).toBe(true);
  });

  it('returns false when the signature is invalid', () => {
    process.env.MP_WEBHOOK_SECRET = 'another_secret';
    const payload = { id: '456', data: { id: 'abc' } };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const headers = {
      'x-signature': 'ts=123456789, v1=invalidsignature',
      'x-request-id': 'req-invalid',
    };

    const valid = callVerify(rawBody, headers);
    expect(valid).toBe(false);
  });

  it('validates payloads com IDs numéricos muito grandes sem perda de precisão', () => {
    process.env.MP_WEBHOOK_SECRET = 'secret_big_id';
    const bigId = '12345678901234567890';
    const rawBody = Buffer.from(`{"id":"notif-1","type":"payment","data":{"id":${bigId}}}`);
    const ts = Math.floor(Date.now() / 1000);
    const requestId = 'req-big';
    const signatureString = `id:${bigId};request-id:${requestId};ts:${ts};`;
    const digest = crypto.createHmac('sha256', process.env.MP_WEBHOOK_SECRET).update(signatureString).digest('hex');
    const headers = {
      'x-signature': `ts=${ts}, v1=${digest}`,
      'x-request-id': requestId,
    };

    const valid = callVerify(rawBody, headers);
    expect(valid).toBe(true);
  });

  it('falls back to resource/id for non-payment topics', () => {
    process.env.MP_WEBHOOK_SECRET = 'secret_fallback';
    const payload = {
      type: 'merchant_order',
      id: 'should-not-be-used',
      resource: 'https://api.mercadopago.com/merchant_orders/777777',
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const ts = Math.floor(Date.now() / 1000);
    const requestId = 'req-fallback';
    const signatureString = 'id:777777;request-id:req-fallback;ts:' + ts + ';';
    const digest = crypto.createHmac('sha256', process.env.MP_WEBHOOK_SECRET).update(signatureString).digest('hex');
    const headers = {
      'x-signature': `ts=${ts}, v1=${digest}`,
      'x-request-id': requestId,
    };
    const valid = callVerify(rawBody, headers);
    expect(valid).toBe(true);
  });

  it('usa merchant_order_id antes do notificationId quando data.id não existe', () => {
    process.env.MP_WEBHOOK_SECRET = 'secret_merchant_order';
    const payload = {
      id: 'notification-guid',
      type: 'merchant_order',
      merchant_order_id: '555666777888',
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const ts = Math.floor(Date.now() / 1000);
    const requestId = 'req-merchant';
    const signatureString = 'id:555666777888;request-id:req-merchant;ts:' + ts + ';';
    const digest = crypto.createHmac('sha256', process.env.MP_WEBHOOK_SECRET).update(signatureString).digest('hex');
    const headers = {
      'x-signature': `ts=${ts}, v1=${digest}`,
      'x-request-id': requestId,
    };
    const valid = callVerify(rawBody, headers);
    expect(valid).toBe(true);
  });

  it('uses resource id when payment payload lacks data.id', () => {
    process.env.MP_WEBHOOK_SECRET = 'secret_payment_resource';
    const payload = {
      type: 'payment',
      id: 'notif-123',
      resource: 'https://api.mercadopago.com/v1/payments/555555',
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const ts = Math.floor(Date.now() / 1000);
    const requestId = 'req-resource';
    const signatureString = 'id:555555;request-id:req-resource;ts:' + ts + ';';
    const digest = crypto.createHmac('sha256', process.env.MP_WEBHOOK_SECRET).update(signatureString).digest('hex');
    const headers = {
      'x-signature': `ts=${ts}, v1=${digest}`,
      'x-request-id': requestId,
    };
    const valid = callVerify(rawBody, headers);
    expect(valid).toBe(true);
  });

  it('falls back to query string data.id when corpo nao traz identificador', () => {
    process.env.MP_WEBHOOK_SECRET = 'secret_query_param';
    const payload = {
      type: 'payment',
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const ts = Math.floor(Date.now() / 1000);
    const requestId = 'req-query';
    const signatureString = 'id:989898;request-id:req-query;ts:' + ts + ';';
    const digest = crypto.createHmac('sha256', process.env.MP_WEBHOOK_SECRET).update(signatureString).digest('hex');
    const headers = {
      'x-signature': `ts=${ts}, v1=${digest}`,
      'x-request-id': requestId,
    };
    const valid = callVerify(rawBody, headers, { query: { 'data.id': '989898' } });
    expect(valid).toBe(true);
  });

  it('falha quando nenhum identificador válido está presente no payload', () => {
    process.env.MP_WEBHOOK_SECRET = 'secret_skip';
    const payload = {
      type: 'merchant_order',
    };
    const rawBody = Buffer.from(JSON.stringify(payload));
    const headers = {
      'x-signature': 'ts=123,v1=abc',
      'x-request-id': 'req-missing-id',
    };
    const valid = callVerify(rawBody, headers);
    expect(valid).toBe(false);
  });
});
