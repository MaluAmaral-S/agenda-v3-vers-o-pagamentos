const { Op } = require('sequelize');
const { Appointment, Service, User, MercadoPagoRefundLog } = require('../models');
const logger = require('../utils/logger');
const { ensureValidAccessToken } = require('../services/mercadoPagoOAuthService');
const { createPreference } = require('../services/mercadoPagoPreferenceService');
const { buildBusinessSlug } = require('../utils/businessSlug');
const {
  processRefund,
  findAppointmentByPaymentId,
  findAppointmentByReference,
  fetchPayment,
  listRefunds,
  ensureSellerToken,
} = require('../services/mercadoPagoPaymentService');

function normalizeAmount(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function ensurePaymentStatusSync(appointment, status) {
  if (!status) return;
  appointment.paymentStatus = status;
  switch (status) {
    case 'paid':
      appointment.statusPagamento = 'pago';
      break;
    case 'refunded':
    case 'partially_refunded':
      appointment.statusPagamento = 'reembolsado';
      break;
    default:
      appointment.statusPagamento = 'pendente';
  }
}

exports.getSettings = async (req, res) => {
  try {
    const business = req.businessUser || (req.user?.id ? await User.findByPk(req.user.id) : null);
    if (!business) {
      return res.status(401).json({ message: 'Usuário não autenticado.' });
    }

    return res.json({
      paymentsEnabled: Boolean(business.paymentsEnabled),
      mpConnected: Boolean(business.mpAccessToken),
      mpUserId: business.mpUserId || null,
    });
  } catch (error) {
    logger.error('mercadopago.settings.fetch_failed', { error: error.message });
    return res.status(500).json({ message: 'Não foi possível obter as configurações de pagamentos.' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const business = req.businessUser || (req.user?.id ? await User.findByPk(req.user.id) : null);
    if (!business) {
      return res.status(401).json({ message: 'Usuário não autenticado.' });
    }

    const enabledRaw = req.body?.enabled;
    const enabled = enabledRaw === true || enabledRaw === 'true';
    await business.update({ paymentsEnabled: enabled });

    logger.audit('mercadopago.settings.updated', {
      businessId: business.id,
      paymentsEnabled: enabled,
    });

    return res.json({
      paymentsEnabled: Boolean(business.paymentsEnabled),
      mpConnected: Boolean(business.mpAccessToken),
      mpUserId: business.mpUserId || null,
    });
  } catch (error) {
    logger.error('mercadopago.settings.update_failed', { error: error.message });
    return res.status(500).json({ message: 'Não foi possível atualizar as configurações de pagamentos.' });
  }
};

exports.listRecentPayments = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Usuário não autenticado.' });
    }

    const appointments = await Appointment.findAll({
      where: {
        userId,
        mpPaymentId: {
          [Op.not]: null,
        },
      },
      order: [['updatedAt', 'DESC']],
      limit: 10,
      attributes: ['id', 'clientName', 'clientEmail', 'appointmentDate', 'appointmentTime', 'amount', 'currency', 'paymentStatus', 'mpPaymentId', 'mpPreferenceId', 'updatedAt'],
    });

    const payments = appointments.map((appointment) => ({
      appointmentId: appointment.id,
      clientName: appointment.clientName,
      clientEmail: appointment.clientEmail,
      scheduledFor: `${appointment.appointmentDate} ${appointment.appointmentTime}`,
      amount: appointment.amount,
      currency: appointment.currency,
      paymentStatus: appointment.paymentStatus,
      mpPaymentId: appointment.mpPaymentId,
      mpPreferenceId: appointment.mpPreferenceId,
      updatedAt: appointment.updatedAt,
    }));

    return res.json({ payments });
  } catch (error) {
    logger.error('mercadopago.payments.list_failed', { error: error.message });
    return res.status(500).json({ message: 'Não foi possível listar os pagamentos recentes.' });
  }
};

function sanitizeMetadata(appointment, business, metadata) {
  const base = {
    bookingId: appointment.id,
    companyId: business.id,
  };
  if (metadata && typeof metadata === 'object') {
    return { ...metadata, ...base };
  }
  return base;
}

async function loadAppointmentForCheckout(bookingId) {
  return Appointment.findByPk(bookingId, {
    include: [
      { model: Service, as: 'service' },
      { model: User, as: 'business' },
    ],
  });
}

exports.startCheckoutPro = async (req, res) => {
  let appointment = null;

  try {
    const bookingId = Number(req.body?.bookingId);
    const companyId = req.body?.companyId ? Number(req.body.companyId) : null;

    if (!Number.isFinite(bookingId)) {
      return res.status(400).json({ message: 'bookingId inválido.' });
    }

    appointment = await loadAppointmentForCheckout(bookingId);

    if (!appointment) {
      return res.status(404).json({ message: 'Agendamento não encontrado.' });
    }

    if (companyId && appointment.userId !== companyId) {
      return res.status(404).json({ message: 'Agendamento não encontrado para esta empresa.' });
    }

    const business = appointment.business;
    if (!business) {
      return res.status(404).json({ message: 'Empresa responsável pelo agendamento não encontrada.' });
    }

    if (!business.paymentsEnabled) {
      return res.status(403).json({ message: 'Pagamentos desativados para esta empresa.' });
    }

    if (!business.mpAccessToken) {
      return res.status(403).json({ message: 'Empresa não está conectada ao Mercado Pago.' });
    }

    await ensureValidAccessToken(business);

    // Log token (não completo) e URL de notificação para depuração.
    try {
      const token = business.mpAccessToken || '';
      const tokenLast4 = token ? token.slice(-4) : null;
      const notificationUrl =
        process.env.MP_WEBHOOK_PUBLIC_URL ||
        `${(process.env.SERVER_URL || 'http://localhost:3000').replace(/\/$/, '')}/api/webhooks/mercadopago`;
      logger.info('mercadopago.checkout_pro.init', {
        appointmentId: appointment.id,
        businessId: business.id,
        tokenLast4,
        notificationUrl,
      });
    } catch (_logError) {
      // ignora falha de log
    }

    const service = appointment.service;
    const amount = normalizeAmount(req.body?.total ?? appointment.amount ?? service?.preco);
    if (!amount || amount <= 0) {
      ensurePaymentStatusSync(appointment, 'not_required');
      await appointment.update({
        amount: amount || 0,
        currency: appointment.currency || 'BRL',
        paymentStatus: 'not_required',
        statusPagamento: 'pendente',
      });
      return res.status(200).json({
        message: 'Pagamento não obrigatório para este agendamento.',
        paymentRequired: false,
      });
    }

    const externalReference = appointment.mpExternalReference || String(appointment.id);
    const updates = {
      amount,
      currency: (appointment.currency || 'BRL').toUpperCase(),
      mpExternalReference: externalReference,
      clientName: req.body?.payer?.name || appointment.clientName,
      clientEmail: req.body?.payer?.email || appointment.clientEmail,
      clientPhone: req.body?.payer?.phone?.number || req.body?.payer?.phone || appointment.clientPhone,
      paymentStatus: appointment.paymentStatus === 'not_required' ? 'pending' : appointment.paymentStatus,
      statusPagamento: appointment.statusPagamento || 'pendente',
    };
    await appointment.update(updates);

    const businessSlug = buildBusinessSlug(business);
    const bookingBaseUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
    const bookingUrl = `${bookingBaseUrl}/agendamento/${businessSlug}`;

    const { preference } = await createPreference({
      appointment,
      business,
      service,
      items: req.body?.items || null,
      payer: req.body?.payer || null,
      metadata: sanitizeMetadata(appointment, business, req.body?.metadata),
      backUrlParams: {
        booking_slug: businessSlug,
        booking_url: bookingUrl,
        appointment_id: appointment.id,
      },
    });

    if (preference?.id) {
      await appointment.update({
        mpPreferenceId: preference.id,
        paymentStatus: 'pending',
        statusPagamento: 'pendente',
      });
    }

    return res.status(201).json({
      init_point: preference?.init_point,
      id: preference?.id,
      sandbox_init_point: preference?.sandbox_init_point,
      preference_id: preference?.id,
      public_key: preference?.client_id,
    });
  } catch (error) {
    const statusFromMp = error?.response?.status;
    const errorData = error?.response?.data;

    if (statusFromMp === 401 || errorData?.error === 'invalid_token') {
      logger.warn('mercadopago.preference.invalid_token', {
        appointmentId: appointment?.id,
        businessId: appointment?.userId,
        error: errorData,
      });

      if (appointment?.business) {
        try {
          await appointment.business.update({
            mpAccessToken: null,
            mpRefreshToken: null,
            mpTokenExpiresAt: null,
          });
        } catch (persistError) {
          logger.error('mercadopago.preference.invalidate_token_failed', {
            businessId: appointment?.userId,
            error: persistError.message,
          });
        }
      }

      return res.status(401).json({
        message: 'Token Mercado Pago inválido ou expirado. Refaça a conexão da conta nas configurações de pagamentos.',
        error: errorData,
      });
    }

    logger.error('mercadopago.preference.controller_failed', {
      error: errorData || error.message,
    });
    return res.status(500).json({
      message: 'Falha ao criar preferência de pagamento no Mercado Pago.',
      error: errorData || error.message,
    });
  }
};

async function resolveAppointmentForRefund(paymentId, business) {
  const appointment = await findAppointmentByPaymentId(paymentId);
  if (appointment && appointment.userId !== business.id) {
    const err = new Error('Pagamento não pertence a esta empresa.');
    err.status = 404;
    throw err;
  }
  if (appointment) return appointment;

  let payment;
  try {
    payment = await fetchPayment(paymentId, business.mpAccessToken);
  } catch (error) {
    if (error.response?.status === 404) {
      const err = new Error('Pagamento não encontrado.');
      err.status = 404;
      throw err;
    }
    throw error;
  }
  if (payment.collector_id && String(payment.collector_id) !== String(business.mpUserId || '')) {
    const err = new Error('Pagamento não pertence a esta empresa.');
    err.status = 404;
    throw err;
  }

  if (payment.external_reference) {
    const appointmentByReference = await findAppointmentByReference(payment.external_reference);
    if (appointmentByReference && appointmentByReference.userId === business.id) {
      return appointmentByReference;
    }
  }

  return null;
}

exports.createRefund = async (req, res) => {
  try {
    const amount = normalizeAmount(req.body?.amount);
    const paymentId = req.params?.paymentId ? String(req.params.paymentId) : null;

    if (!paymentId) {
      return res.status(400).json({ message: 'paymentId é obrigatório.' });
    }

    const business = req.businessUser || (req.user?.id ? await User.findByPk(req.user.id) : null);
    if (!business) {
      return res.status(401).json({ message: 'Usuário não autenticado.' });
    }

    await ensureSellerToken(business);

    const appointment = await resolveAppointmentForRefund(paymentId, business).catch((err) => {
      logger.warn('mercadopago.refund.resolve_appointment_failed', {
        paymentId,
        error: err.message,
      });
      if (err.status === 404) {
        res.status(404).json({ message: 'Pagamento não encontrado para esta empresa.' });
        return null;
      }
      throw err;
    });
    if (appointment === null) {
      return;
    }

    const initiator = `user:${req.user?.id || business.id}`;

    const refundResponse = await processRefund({
      appointment,
      amount: amount || null,
      initiator,
      paymentId,
      business,
    });

    return res.status(201).json({
      message: 'Reembolso solicitado com sucesso.',
      paymentId,
      refund: refundResponse,
    });
  } catch (error) {
    logger.error('mercadopago.refund.controller_failed', {
      error: error.response?.data || error.message,
    });
    const status = error.status || error.response?.status || 500;
    const message =
      status === 404
        ? 'Pagamento não encontrado para esta empresa.'
        : 'Não foi possível realizar o reembolso.';
    return res.status(status).json({
      message,
      error: error.response?.data || error.message,
    });
  }
};

exports.listRefunds = async (req, res) => {
  try {
    const paymentId = req.params?.paymentId ? String(req.params.paymentId) : null;
    if (!paymentId) {
      return res.status(400).json({ message: 'paymentId é obrigatório.' });
    }

    const business = req.businessUser || (req.user?.id ? await User.findByPk(req.user.id) : null);
    if (!business) {
      return res.status(401).json({ message: 'Usuário não autenticado.' });
    }

    await ensureSellerToken(business);
    const appointment = await resolveAppointmentForRefund(paymentId, business).catch((err) => {
      logger.warn('mercadopago.refund.resolve_appointment_failed', {
        paymentId,
        error: err.message,
      });
      if (err.status === 404) {
        res.status(404).json({ message: 'Pagamento não encontrado para esta empresa.' });
        return null;
      }
      throw err;
    });
    if (appointment === null) {
      return;
    }

    const refunds = await listRefunds(paymentId, business.mpAccessToken);
    const logs = await MercadoPagoRefundLog.findAll({
      where: { paymentId, businessId: business.id },
      order: [['createdAt', 'DESC']],
      limit: 50,
    });

    return res.json({
      paymentId,
      refunds,
      logs: logs.map((log) => ({
        id: log.id,
        refundId: log.refundId,
        requestAmount: log.requestAmount,
        refundedAmount: log.refundedAmount,
        currency: log.currency,
        status: log.status,
        initiator: log.initiator,
        idempotencyKey: log.idempotencyKey,
        createdAt: log.createdAt,
        updatedAt: log.updatedAt,
      })),
    });
  } catch (error) {
    logger.error('mercadopago.refund.list_failed', {
      error: error.response?.data || error.message,
    });
    const status = error.status || error.response?.status || 500;
    const message =
      status === 404
        ? 'Pagamento não encontrado para esta empresa.'
        : 'Não foi possível listar os reembolsos deste pagamento.';
    return res.status(status).json({
      message,
      error: error.response?.data || error.message,
    });
  }
};

// Compatibilidade temporária com rota antiga
exports.createPreference = exports.startCheckoutPro;
