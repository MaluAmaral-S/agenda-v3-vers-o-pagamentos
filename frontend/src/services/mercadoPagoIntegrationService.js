import { apiRequest } from './api';
import { API_ROUTES } from '@/utils/constants';

export const fetchIntegrationStatus = () =>
  apiRequest.get(API_ROUTES.MERCADO_PAGO.CONNECT.STATUS);

export const getAuthorizationUrl = () =>
  apiRequest.post(API_ROUTES.MERCADO_PAGO.CONNECT.CONNECT_URL);

export const fetchPaymentSettings = () =>
  apiRequest.get(API_ROUTES.MERCADO_PAGO.PAYMENTS.SETTINGS);

export const updatePaymentSettings = (enabled) =>
  apiRequest.patch(API_ROUTES.MERCADO_PAGO.PAYMENTS.SETTINGS, { enabled });

export const listRecentPayments = () =>
  apiRequest.get(API_ROUTES.MERCADO_PAGO.PAYMENTS.BASE);

export const startCheckoutPro = (payload) =>
  apiRequest.post(API_ROUTES.MERCADO_PAGO.PAYMENTS.CHECKOUT_PRO, payload);

export const createPreference = (bookingId, options = {}) =>
  startCheckoutPro({ bookingId, ...options });

export const requestRefund = (paymentId, amount) => {
  const body = {};
  if (amount !== undefined && amount !== null) {
    body.amount = amount;
  }
  return apiRequest.post(API_ROUTES.MERCADO_PAGO.PAYMENTS.REFUNDS(paymentId), body);
};

export const listRefundsForPayment = (paymentId) =>
  apiRequest.get(API_ROUTES.MERCADO_PAGO.PAYMENTS.REFUNDS(paymentId));
