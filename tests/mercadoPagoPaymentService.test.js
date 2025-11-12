const { normalizeStatus } = require('../src/services/mercadoPagoPaymentService');

describe('mercadoPagoPaymentService.normalizeStatus', () => {
  it('normalizes approved payments to paid', () => {
    expect(normalizeStatus('approved')).toBe('paid');
    expect(normalizeStatus('AUTHORIZED')).toBe('paid');
  });

  it('normalizes refunded payments to refunded', () => {
    expect(normalizeStatus('refunded')).toBe('refunded');
    expect(normalizeStatus('partially_refunded')).toBe('partially_refunded');
  });

  it('normalizes cancellation statuses to cancelled', () => {
    expect(normalizeStatus('cancelled')).toBe('cancelled');
    expect(normalizeStatus('charged_back')).toBe('cancelled');
  });

  it('defaults unknown statuses to failed', () => {
    expect(normalizeStatus('unknown_status')).toBe('failed');
  });
});
