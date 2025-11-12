const crypto = require('crypto');
const logger = require('../utils/logger');
const { createMercadoPagoClient } = require('./mercadoPagoClient');
const { ensureValidAccessToken } = require('./mercadoPagoOAuthService');
const { Appointment, User, MercadoPagoRefundLog } = require('../models');

function getPlatformAccessToken() {
  return process.env.MP_PLATFORM_ACCESS_TOKEN || null;
}

function normalizeStatus(status) {
  if (!status) return 'pending';
  switch (status.toLowerCase()) {
    case 'approved':
    case 'authorized':
      return 'paid';
    case 'refunded':
      return 'refunded';
    case 'charged_back':
    case 'cancelled':
    case 'canceled':
    case 'reversed':
      return 'cancelled';
    case 'in_process':
    case 'in_mediation':
      return 'in_process';
    case 'pending':
      return 'pending';
    case 'partially_refunded':
      return 'partially_refunded';
    case 'rejected':
    default:
      return 'failed';
  }
}

function mapToLegacyStatus(paymentStatus) {
  switch (paymentStatus) {
    case 'paid':
      return 'pago';
    case 'refunded':
    case 'partially_refunded':
      return 'reembolsado';
    case 'pending':
    case 'in_process':
    case 'not_required':
      return 'pendente';
    case 'cancelled':
    case 'failed':
      return 'pendente';
    default:
      return 'pendente';
  }
}

async function fetchPayment(paymentId, accessToken) {
  if (!paymentId) throw new Error('paymentId é obrigatório.');
  if (!accessToken) throw new Error('Token do Mercado Pago ausente.');

  const client = createMercadoPagoClient(accessToken);
  const { data } = await client.get(`/v1/payments/${paymentId}`);
  return data;
}

async function fetchPaymentWithPlatformToken(paymentId) {
  const platformToken = getPlatformAccessToken();
  if (!platformToken) {
    throw new Error('MP_PLATFORM_ACCESS_TOKEN não configurado.');
  }
  const client = createMercadoPagoClient(platformToken);
  const { data } = await client.get(`/v1/payments/${paymentId}`);
  return data;
}

async function fetchMerchantOrder(merchantOrderId, accessToken) {
  if (!merchantOrderId) {
    throw new Error('merchantOrderId é obrigatório.');
  }
  if (!accessToken) {
    throw new Error('Token do Mercado Pago ausente.');
  }

  const client = createMercadoPagoClient(accessToken);
  const { data } = await client.get(`/merchant_orders/${merchantOrderId}`);
  return data;
}

async function fetchMerchantOrderWithPlatformToken(merchantOrderId) {
  const platformToken = getPlatformAccessToken();
  if (!platformToken) {
    throw new Error('MP_PLATFORM_ACCESS_TOKEN não configurado.');
  }
  return fetchMerchantOrder(merchantOrderId, platformToken);
}

async function findBusinessByCollectorId(collectorId) {
  if (!collectorId) return null;
  const normalized = String(collectorId);
  return User.findOne({ where: { mpUserId: normalized } });
}

async function findAppointmentByReference(reference) {
  if (!reference) return null;
  const id = Number(reference);
  if (!Number.isFinite(id)) {
    return Appointment.findOne({ where: { mpExternalReference: String(reference) } });
  }
  return Appointment.findByPk(id);
}

async function findAppointmentByPaymentId(paymentId) {
  if (!paymentId) return null;
  return Appointment.findOne({
    where: { mpPaymentId: String(paymentId) },
  });
}

async function ensureSellerToken(business) {
  if (!business) throw new Error('Empresa não encontrada.');
  await ensureValidAccessToken(business);
  return business;
}

async function updateAppointmentFromPayment(appointment, payment) {
  if (!appointment) {
    throw new Error('Agendamento não encontrado.');
  }
  const status = normalizeStatus(payment.status);
  const legacyStatus = mapToLegacyStatus(status);
  const updates = {
    mpPaymentId: String(payment.id),
    paymentStatus: status,
    statusPagamento: legacyStatus,
  };

  if (!appointment.mpPreferenceId && payment.order?.id) {
    updates.mpPreferenceId = String(payment.order.id);
  }
  if (!appointment.amount) {
    const amount = Number(payment.transaction_amount);
    if (Number.isFinite(amount)) {
      updates.amount = amount;
    }
  }
  if (!appointment.currency && payment.currency_id) {
    updates.currency = payment.currency_id.toUpperCase();
  }
  if (!appointment.mpExternalReference && payment.external_reference) {
    updates.mpExternalReference = payment.external_reference;
  }
  if (status === 'paid') {
    updates.valorPago = Number(payment.transaction_amount);
  }
  if (status === 'refunded' || status === 'partially_refunded') {
    updates.valorPago = Number(payment.money_release_amount) || Number(payment.transaction_amount);
  }

  await appointment.update(updates);
  logger.audit('mercadopago.payment.status_updated', {
    appointmentId: appointment.id,
    paymentStatus: status,
    paymentId: payment.id,
  });
  return appointment;
}

function resolveCurrency(appointment, fallback = 'BRL') {
  if (appointment?.currency) return appointment.currency.toUpperCase();
  return fallback;
}

async function recordRefundLog({
  appointment,
  business,
  paymentId,
  requestAmount,
  response,
  initiator,
  idempotencyKey,
}) {
  try {
    await MercadoPagoRefundLog.create({
      appointmentId: appointment?.id || null,
      businessId: business?.id || null,
      paymentId: String(paymentId),
      refundId: response?.id ? String(response.id) : null,
      requestAmount: requestAmount !== undefined ? requestAmount : null,
      refundedAmount: response?.amount ?? null,
      currency: resolveCurrency(appointment, response?.currency_id || 'BRL'),
      status: response?.status || null,
      initiator: initiator || null,
      idempotencyKey: idempotencyKey || null,
      rawResponse: response || null,
    });
  } catch (error) {
    logger.error('mercadopago.refund.log_failed', {
      paymentId,
      error: error.message,
    });
  }
}

async function processRefund({
  appointment,
  amount = null,
  initiator = 'business',
  paymentId = null,
  business = null,
}) {
  const targetPaymentId = paymentId || appointment?.mpPaymentId;
  if (!targetPaymentId) {
    throw new Error('Pagamento Mercado Pago não identificado para reembolso.');
  }

  let seller = business;
  if (!seller && appointment?.userId) {
    seller = await User.findByPk(appointment.userId);
  }
  if (!seller) {
    throw new Error('Empresa responsável pelo pagamento não encontrada.');
  }

  await ensureSellerToken(seller);

  const client = createMercadoPagoClient(seller.mpAccessToken);
  const body = {};
  let requestAmount = null;
  if (amount !== null && Number(amount) > 0) {
    requestAmount = Number(amount);
    body.amount = requestAmount;
  }

  const idempotencyKey = crypto.randomUUID();

  logger.audit('mercadopago.refund.requested', {
    appointmentId: appointment?.id || null,
    paymentId: targetPaymentId,
    amount: requestAmount || 'full',
    initiator,
    idempotencyKey,
  });

  try {
    const { data } = await client.post(`/v1/payments/${targetPaymentId}/refunds`, body, {
      headers: {
        'X-Idempotency-Key': idempotencyKey,
      },
    });

    if (appointment) {
      const isPartial = requestAmount && Number(requestAmount) > 0;
      await appointment.update({
        paymentStatus: isPartial ? 'partially_refunded' : 'refunded',
        statusPagamento: 'reembolsado',
      });
    }

    await recordRefundLog({
      appointment,
      business: seller,
      paymentId: targetPaymentId,
      requestAmount,
      response: data,
      initiator,
      idempotencyKey,
    });

    logger.audit('mercadopago.refund.success', {
      appointmentId: appointment?.id || null,
      paymentId: targetPaymentId,
      refundId: data?.id || null,
      amount: requestAmount || data?.amount || 'full',
    });
    return data;
  } catch (error) {
    logger.error('mercadopago.refund.failed', {
      appointmentId: appointment?.id || null,
      paymentId: targetPaymentId,
      error: error.response?.data || error.message,
    });
    throw error;
  }
}

async function listRefunds(paymentId, accessToken) {
  if (!paymentId) {
    throw new Error('paymentId é obrigatório para listar reembolsos.');
  }
  if (!accessToken) {
    throw new Error('Token do Mercado Pago ausente.');
  }

  const client = createMercadoPagoClient(accessToken);
  const { data } = await client.get(`/v1/payments/${paymentId}/refunds`);
  if (!Array.isArray(data)) {
    return [];
  }
  return data;
}

module.exports = {
  normalizeStatus,
  fetchPayment,
  fetchPaymentWithPlatformToken,
  fetchMerchantOrder,
  fetchMerchantOrderWithPlatformToken,
  findBusinessByCollectorId,
  findAppointmentByReference,
  findAppointmentByPaymentId,
  updateAppointmentFromPayment,
  processRefund,
  ensureSellerToken,
  listRefunds,
};
