const JSONbig = require('json-bigint')({ storeAsString: true });
const logger = require('../utils/logger');
const {
  verifySignature,
  recordIncomingEvent,
  markProcessed,
} = require('../services/mercadoPagoWebhookService');
const {
  fetchPaymentWithPlatformToken,
  findBusinessByCollectorId,
  ensureSellerToken,
  fetchPayment,
  fetchMerchantOrderWithPlatformToken,
  fetchMerchantOrder,
  findAppointmentByReference,
  findAppointmentByPaymentId,
  updateAppointmentFromPayment,
} = require('../services/mercadoPagoPaymentService');
const { User } = require('../models');

function resolveTopic(payload) {
  return payload?.topic || payload?.type || payload?.action || null;
}

function resolveMerchantOrderId(payload) {
  return (
    payload?.merchant_order_id ||
    payload?.data?.merchant_order_id ||
    payload?.data?.id ||
    payload?.id ||
    (payload?.resource ? payload.resource.split('/').pop() : null)
  );
}

async function handlePaymentTopic(payload) {
  const paymentId = payload?.data?.id || payload?.resource?.split('/').pop();
  if (!paymentId) {
    throw new Error('ID do pagamento ausente no payload.');
  }

  const preliminary = await fetchPaymentWithPlatformToken(paymentId);

  let business = await findBusinessByCollectorId(preliminary.collector_id);
  if (!business && preliminary.external_reference) {
    const appointment = await findAppointmentByReference(preliminary.external_reference);
    if (appointment) {
      business = await User.findByPk(appointment.userId);
    }
  }

  if (!business) {
    throw new Error('Empresa conectada ao pagamento não encontrada.');
  }

  await ensureSellerToken(business);
  const sellerPayment = await fetchPayment(paymentId, business.mpAccessToken);

  const appointment =
    (sellerPayment.external_reference && (await findAppointmentByReference(sellerPayment.external_reference))) ||
    (preliminary.external_reference && (await findAppointmentByReference(preliminary.external_reference)));

  if (!appointment) {
    throw new Error('Agendamento associado ao pagamento não encontrado.');
  }

  await updateAppointmentFromPayment(appointment, sellerPayment);

  logger.audit('mercadopago.webhook.payment_processed', {
    appointmentId: appointment.id,
    paymentId: sellerPayment.id,
    paymentStatus: sellerPayment.status,
    businessId: business.id,
  });

  return { businessId: business.id };
}

function resolveCollectorFromOrder(order) {
  return (
    order?.collector?.id ||
    order?.seller?.id ||
    (Array.isArray(order?.payments) && order.payments.length ? order.payments[0]?.collector?.id : null)
  );
}

async function handleMerchantOrderTopic(payload) {
  const merchantOrderId = resolveMerchantOrderId(payload);
  if (!merchantOrderId) {
    throw new Error('ID da merchant_order ausente no payload.');
  }

  const preliminaryOrder = await fetchMerchantOrderWithPlatformToken(merchantOrderId);

  let business = null;
  const collectorId = resolveCollectorFromOrder(preliminaryOrder);
  if (collectorId) {
    business = await findBusinessByCollectorId(collectorId);
  }

  if (!business && preliminaryOrder?.external_reference) {
    const appointment = await findAppointmentByReference(preliminaryOrder.external_reference);
    if (appointment) {
      business = await User.findByPk(appointment.userId);
    }
  }

  if (!business) {
    throw new Error('Empresa conectada à merchant_order não encontrada.');
  }

  await ensureSellerToken(business);

  let sellerOrder = preliminaryOrder;
  try {
    sellerOrder = await fetchMerchantOrder(merchantOrderId, business.mpAccessToken);
  } catch (error) {
    logger.warn('mercadopago.webhook.merchant_order.fetch_seller_failed', {
      orderId: merchantOrderId,
      error: error.response?.data || error.message,
    });
  }

  const payments =
    (Array.isArray(sellerOrder?.payments) && sellerOrder.payments.length ? sellerOrder.payments : null) ||
    (Array.isArray(preliminaryOrder?.payments) ? preliminaryOrder.payments : []);

  if (!payments.length) {
    logger.info('mercadopago.webhook.merchant_order.no_payments', {
      orderId: merchantOrderId,
      businessId: business.id,
    });
    return { businessId: business.id };
  }

  for (const paymentSummary of payments) {
    const paymentId = paymentSummary?.id || paymentSummary?.payment_id;
    if (!paymentId) {
      continue;
    }

    let paymentData = null;
    try {
      paymentData = await fetchPayment(paymentId, business.mpAccessToken);
    } catch (error) {
      logger.warn('mercadopago.webhook.merchant_order.payment_fetch_failed', {
        orderId: merchantOrderId,
        paymentId,
        businessId: business.id,
        error: error.response?.data || error.message,
      });
      continue;
    }

    let appointment = await findAppointmentByPaymentId(String(paymentId));
    if (!appointment && paymentData?.external_reference) {
      appointment = await findAppointmentByReference(paymentData.external_reference);
    }
    if (!appointment && sellerOrder?.external_reference) {
      appointment = await findAppointmentByReference(sellerOrder.external_reference);
    }

    if (!appointment) {
      logger.warn('mercadopago.webhook.merchant_order.appointment_missing', {
        orderId: merchantOrderId,
        paymentId,
        businessId: business.id,
      });
      continue;
    }

    await updateAppointmentFromPayment(appointment, paymentData);
    logger.audit('mercadopago.webhook.merchant_order.payment_synced', {
      orderId: merchantOrderId,
      appointmentId: appointment.id,
      paymentId,
      paymentStatus: paymentData.status,
      businessId: business.id,
    });
  }

  return { businessId: business.id };
}

async function processWebhookPayload(payload) {
  let record = null;

  try {
    const registered = await recordIncomingEvent(payload);
    record = registered.event;
    if (registered.duplicate) {
      await markProcessed(record, { businessId: record.businessId || null });
      return;
    }

    const topic = resolveTopic(payload);
    let outcome = null;

    if (topic === 'payment') {
      outcome = await handlePaymentTopic(payload);
    } else if (topic === 'merchant_order') {
      outcome = await handleMerchantOrderTopic(payload);
    } else {
      logger.info('mercadopago.webhook.ignored_topic', { topic });
      await markProcessed(record, {});
      return;
    }

    await markProcessed(record, { businessId: outcome?.businessId || null });
  } catch (error) {
    logger.error('mercadopago.webhook.process_failed', {
      error: error.response?.data || error.message,
    });
    if (record) {
      await markProcessed(record, {
        error: error.response?.data || error.message,
        businessId: record.businessId || null,
      });
    }
  }
};

exports.handleNotification = (req, res) => {
  // Garante que o corpo bruto seja um Buffer. O Express raw parser fornece
  // Buffer, mas outras configurações podem enviar string. Convertê-lo evita
  // inconsistências ao validar assinatura.
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');

  // Log inicial com detalhes do payload e headers. Para depuração detalhada
  // incluímos verificação de tipo e tamanho.
  logger.info('mercadopago.webhook.received_payload', {
    isBuffer: Buffer.isBuffer(req.body),
    bodyLength: rawBody.length,
    hasSignature: !!req.headers['x-signature'],
    hasRequestId: !!req.headers['x-request-id'],
  });
  logger.info('mercadopago.webhook.signature_header', {
    signature: req.headers['x-signature'] || null,
  });

  // Verifica a assinatura. Caso inválida, retorna 401 com código específico.
  const signatureValid = verifySignature({
    rawBody,
    signatureHeader: req.headers['x-signature'],
    requestId: req.headers['x-request-id'],
    secret: process.env.MP_WEBHOOK_SECRET,
    query: req.query,
  });
  if (!signatureValid) {
    return res.status(401).json({ error: 'unauthorized', code: 'SIG_MISMATCH' });
  }

  // Responde 200 imediatamente para que o Mercado Pago não reenvie a notificação.
  res.status(200).json({ ok: true });

  // Processa o payload de forma assíncrona. Se ocorrer erro no processamento,
  // será registrado nos logs pelo processWebhookPayload.
  setImmediate(async () => {
    try {
      const payload = rawBody.length ? JSONbig.parse(rawBody.toString('utf8')) : {};
      await processWebhookPayload(payload);
    } catch (error) {
      logger.error('mercadopago.webhook.invalid_payload', { error: error.message });
    }
  });
};
