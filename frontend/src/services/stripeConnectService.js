export {
  fetchIntegrationStatus as fetchConnectStatus,
  getAuthorizationUrl as ensureConnectAccount,
  getAuthorizationUrl as generateOnboardingLink,
  fetchPaymentSettings,
  updatePaymentSettings,
  listRecentPayments,
} from './mercadoPagoIntegrationService';

// Backwards compatibility helpers
export {
  createPreference,
  startCheckoutPro,
  requestRefund,
  listRefundsForPayment,
} from './mercadoPagoIntegrationService';
