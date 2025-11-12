const crypto = require('crypto');
const axios = require('axios');
const { createMercadoPagoClient } = require('./mercadoPagoClient');
const logger = require('../utils/logger');

const DEFAULT_ITEM_CATEGORY_ID = process.env.MP_DEFAULT_ITEM_CATEGORY_ID || 'services';

function resolveItemId(appointment, service, override = null) {
  if (override?.id) {
    return String(override.id);
  }
  if (service?.id) {
    return `service-${service.id}`;
  }
  if (appointment?.id) {
    return `appointment-${appointment.id}`;
  }
  return crypto.randomUUID();
}

function resolveItemDescription(appointment, service, override = null) {
  if (override?.description) {
    return String(override.description).trim();
  }
  if (appointment?.descricao || appointment?.description) {
    return String(appointment.descricao || appointment.description);
  }
  if (appointment?.notes) {
    return String(appointment.notes);
  }
  if (service?.descricao) {
    return String(service.descricao);
  }
  if (service?.nome) {
    return `Serviço: ${service.nome}`;
  }
  if (appointment?.clientName) {
    return `Serviço para ${appointment.clientName}`;
  }
  return 'Serviço agendado';
}

function resolveItemCategory(appointment, service, override = null) {
  const category =
    override?.category_id ||
    override?.categoryId ||
    appointment?.mpItemCategoryId ||
    appointment?.itemCategoryId ||
    service?.categoryId ||
    service?.categoriaId ||
    DEFAULT_ITEM_CATEGORY_ID;

  return String(category);
}

function applyQueryParams(baseUrl, extraParams = {}) {
  if (!baseUrl) return baseUrl;
  try {
    const url = new URL(baseUrl);
    Object.entries(extraParams || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });
    return url.toString();
  } catch (_err) {
    return baseUrl;
  }
}

function resolveBackUrls(extraParams = {}) {
  const success =
    process.env.NEXT_PUBLIC_MP_SUCCESS_URL || `${process.env.CLIENT_URL || 'http://localhost:5173'}/pagamento/sucesso`;
  const failure =
    process.env.NEXT_PUBLIC_MP_FAILURE_URL || `${process.env.CLIENT_URL || 'http://localhost:5173'}/pagamento/erro`;
  const pending =
    process.env.NEXT_PUBLIC_MP_PENDING_URL || `${process.env.CLIENT_URL || 'http://localhost:5173'}/pagamento/pendente`;

  return {
    success: applyQueryParams(success, extraParams),
    failure: applyQueryParams(failure, extraParams),
    pending: applyQueryParams(pending, extraParams),
  };
}

function resolveNotificationUrl() {
  const base = process.env.MP_WEBHOOK_PUBLIC_URL;
  if (base) return base;
  const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
  return `${serverUrl.replace(/\/$/, '')}/api/webhooks/mercadopago`;
}

function buildItems(appointment, service, overrideItems) {
  const amount = Number(appointment.amount || service?.preco || 0);
  const baseItem = {
    id: resolveItemId(appointment, service),
    title: service?.nome || 'Agendamento',
    quantity: 1,
    unit_price: Number.isFinite(amount) ? Number(amount) : 0,
    currency_id: (appointment.currency || 'BRL').toUpperCase(),
    description: resolveItemDescription(appointment, service),
    category_id: resolveItemCategory(appointment, service),
  };

  if (!Array.isArray(overrideItems) || overrideItems.length === 0) {
    return [baseItem];
  }

  const parsed = overrideItems
    .slice(0, 10)
    .map((item) => ({
      id: resolveItemId(appointment, service, item),
      title: item?.title || baseItem.title,
      quantity: Number.isFinite(Number(item?.quantity)) && Number(item.quantity) > 0 ? Number(item.quantity) : 1,
      unit_price:
        Number.isFinite(Number(item?.unit_price)) && Number(item.unit_price) > 0 ? Number(item.unit_price) : baseItem.unit_price,
      currency_id: (item?.currency_id || baseItem.currency_id || 'BRL').toUpperCase(),
      description: resolveItemDescription(appointment, service, item) || baseItem.description,
      category_id: resolveItemCategory(appointment, service, item) || baseItem.category_id,
    }))
    .filter((item) => item.unit_price >= 0.1);

  return parsed.length ? parsed : [baseItem];
}

function normalizePhoneInput(value) {
  if (!value) return undefined;

  if (typeof value === 'object' && !Array.isArray(value)) {
    const areaCode = value.area_code || value.areaCode || value.ddd || null;
    const number = value.number || value.numero || value.phone || null;
    const sanitizedNumber = number ? String(number).replace(/\D/g, '') : null;
    const sanitizedArea = areaCode ? String(areaCode).replace(/\D/g, '') : null;
    if (sanitizedNumber) {
      return {
        ...(sanitizedArea ? { area_code: sanitizedArea } : {}),
        number: sanitizedNumber,
      };
    }
    return undefined;
  }

  const digits = String(value).replace(/\D/g, '');
  if (!digits) return undefined;

  if (digits.length >= 10) {
    const area = digits.slice(0, 2);
    const number = digits.slice(2);
    return {
      area_code: area,
      number,
    };
  }

  return {
    number: digits,
  };
}

function buildPayer(appointment, override) {
  const overridePhone = normalizePhoneInput(override?.phone);
  const appointmentPhone = normalizePhoneInput(appointment.clientPhone);
  if (override && typeof override === 'object') {
    const payload = {
      name: override.name || appointment.clientName || undefined,
      email: override.email || appointment.clientEmail || undefined,
      identification: override.identification || undefined,
    };
    const phone = overridePhone || appointmentPhone;
    if (phone) {
      payload.phone = phone;
    }
    return payload;
  }

  const payer = {
    name: appointment.clientName || undefined,
    email: appointment.clientEmail || undefined,
  };

  const phone = overridePhone || appointmentPhone;
  if (phone) {
    payer.phone = phone;
  }

  return payer;
}

async function createPreference({
  appointment,
  business,
  service,
  items: overrideItems = null,
  payer: payerOverride = null,
  metadata: metadataOverride = null,
  backUrlParams = null,
}) {
  if (!appointment) throw new Error('Agendamento não fornecido.');
  if (!business?.mpAccessToken) {
    throw new Error('Empresa não possui token do Mercado Pago configurado.');
  }

  const client = createMercadoPagoClient(business.mpAccessToken);
  const idempotencyKey = crypto.randomUUID();

  const backUrls = resolveBackUrls(backUrlParams || {});
  const notificationUrl = resolveNotificationUrl();

  const body = {
    items: buildItems(appointment, service, overrideItems),
    external_reference: appointment.mpExternalReference || String(appointment.id),
    auto_return: 'all',
    back_urls: backUrls,
    notification_url: notificationUrl,
    payer: buildPayer(appointment, payerOverride),
    statement_descriptor: business.businessName ? business.businessName.slice(0, 22) : undefined,
    metadata: {
      appointment_id: appointment.id,
      business_id: business.id,
      ...(metadataOverride && typeof metadataOverride === 'object' ? metadataOverride : {}),
    },
  };

  logger.audit('mercadopago.preference.create_request', {
    appointmentId: appointment.id,
    businessId: business.id,
    idempotencyKey,
    externalReference: body.external_reference,
  });

  try {
    const { data } = await client.post('/checkout/preferences', body, {
      headers: {
        'X-Idempotency-Key': idempotencyKey,
      },
    });
    return { preference: data, idempotencyKey };
  } catch (error) {
    logger.error('mercadopago.preference.create_failed', {
      appointmentId: appointment.id,
      businessId: business.id,
      error: error.response?.data || error.message,
    });
    throw error;
  }
}

module.exports = {
  createPreference,
};
