const mockSessionCreate = jest.fn();
const mockRefreshAccountStatus = jest.fn();

jest.mock('../src/services/stripeConnectService', () => ({
  getStripeClient: jest.fn(() => ({
    checkout: {
      sessions: {
        create: mockSessionCreate,
      },
    },
  })),
  refreshAccountStatus: mockRefreshAccountStatus,
}));

const mockUserFindByPk = jest.fn();
const mockSubscriptionFindOne = jest.fn();

jest.mock('../src/models', () => {
  const paymentCreate = jest.fn();

  return {
    Payment: {
      create: paymentCreate,
      __setCreateImplementation(fn) {
        paymentCreate.mockImplementation(fn);
      },
      __getCreateMock() {
        return paymentCreate;
      },
    },
    User: {
      findByPk: mockUserFindByPk,
    },
    Subscription: {
      findOne: mockSubscriptionFindOne,
    },
    Plan: {},
  };
});

const { Payment, User, Subscription } = require('../src/models');
const { requirePlan } = require('../src/middlewares/requirePlan');
const { createCheckoutSessionForClient } = require('../src/services/stripePaymentService');

describe('Stripe payment service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CLIENT_URL = 'http://localhost:5173';
    mockRefreshAccountStatus.mockResolvedValue({
      status: {
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripeDetailsSubmitted: true,
      },
    });

    User.findByPk.mockResolvedValue({
      id: 99,
      stripeAccountId: 'acct_123',
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeDetailsSubmitted: true,
    });

    Payment.__setCreateImplementation(async () => {
      const record = {
        id: 555,
        stripePaymentIntentId: null,
        stripeCustomerId: null,
        update: jest.fn().mockResolvedValue(undefined),
      };
      Payment.__lastRecord = record;
      return record;
    });

    mockSessionCreate.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.test/session',
      payment_intent: 'pi_test_123',
      customer: 'cus_123',
    });
  });

  it('creates checkout session and updates payment record', async () => {
    const result = await createCheckoutSessionForClient({
      businessId: 99,
      createdByUserId: 77,
      amount: 123.45,
      currency: 'BRL',
      description: 'Teste',
      customer: { email: 'client@example.com', name: 'Cliente Teste' },
    });

    expect(result).toEqual({
      checkoutUrl: 'https://checkout.stripe.test/session',
      sessionId: 'cs_test_123',
      paymentId: 555,
      paymentIntentId: 'pi_test_123',
      transferGroup: 'payment-555',
      paymentMethods: {
        requested: ['card', 'boleto', 'pix'],
        applied: ['card', 'boleto', 'pix'],
        fallbackErrorCode: null,
      },
    });

    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent_data: expect.objectContaining({
          transfer_data: expect.objectContaining({
            destination: 'acct_123',
            amount: 12345,
          }),
          on_behalf_of: 'acct_123',
          transfer_group: 'payment-555',
        }),
        metadata: expect.objectContaining({
          paymentId: '555',
        }),
        payment_method_options: expect.objectContaining({
          boleto: expect.objectContaining({
            expires_after_days: expect.any(Number),
          }),
          pix: expect.objectContaining({
            expires_after_seconds: expect.any(Number),
          }),
        }),
      }),
    );

    const record = Payment.__lastRecord;
    expect(record.update).toHaveBeenNthCalledWith(1, expect.objectContaining({
      requestedPaymentMethods: ['card', 'boleto', 'pix'],
    }));
    expect(record.update).toHaveBeenNthCalledWith(2, expect.objectContaining({
      stripeCheckoutSessionId: 'cs_test_123',
      stripePaymentIntentId: 'pi_test_123',
      stripeCustomerId: 'cus_123',
      appliedPaymentMethods: ['card', 'boleto', 'pix'],
    }));

    expect(Payment.__getCreateMock()).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 12345,
        currency: 'brl',
      }),
    );
  });

  it('marks payment as failed when session creation throws', async () => {
    mockSessionCreate.mockRejectedValueOnce(new Error('Stripe indisponível'));

    const recordUpdates = [];
    Payment.__setCreateImplementation(async () => {
      const record = {
        id: 777,
        stripePaymentIntentId: null,
        stripeCustomerId: null,
        update: jest.fn().mockImplementation(async (payload) => {
          recordUpdates.push(payload);
        }),
      };
      Payment.__lastRecord = record;
      return record;
    });

    await expect(
      createCheckoutSessionForClient({
        businessId: 99,
        createdByUserId: 10,
        amount: 50,
      }),
    ).rejects.toThrow('Stripe indisponível');

    expect(recordUpdates[0]).toEqual({
      requestedPaymentMethods: ['card', 'boleto', 'pix'],
    });
    expect(recordUpdates[1]).toEqual({
      status: 'failed',
      failureReason: 'Stripe indisponível',
      lastStripeErrorCode: null,
    });
  });

  it('faz fallback para cartão quando métodos locais não estão disponíveis', async () => {
    mockSessionCreate
      .mockRejectedValueOnce(Object.assign(new Error('Payment method type boleto cannot be used'), { code: 'payment_method_unavailable' }))
      .mockResolvedValueOnce({
        id: 'cs_test_fallback',
        url: 'https://checkout.stripe.test/session-fallback',
        payment_intent: 'pi_test_fallback',
        customer: 'cus_123',
      });

    Payment.__setCreateImplementation(async () => {
      const record = {
        id: 888,
        stripePaymentIntentId: null,
        stripeCustomerId: null,
        update: jest.fn(),
      };
      Payment.__lastRecord = record;
      return record;
    });

    const result = await createCheckoutSessionForClient({
      businessId: 99,
      createdByUserId: 77,
      amount: 200,
    });

    expect(result.paymentMethods).toEqual({
      requested: ['card', 'boleto', 'pix'],
      applied: ['card'],
      fallbackErrorCode: 'payment_method_unavailable',
    });

    const record = Payment.__lastRecord;
    expect(record.update).toHaveBeenNthCalledWith(1, expect.objectContaining({
      requestedPaymentMethods: ['card', 'boleto', 'pix'],
    }));
    expect(record.update).toHaveBeenNthCalledWith(2, expect.objectContaining({
      appliedPaymentMethods: ['card'],
      lastStripeErrorCode: 'payment_method_unavailable',
    }));
  });
});

describe('requirePlan middleware', () => {
  const buildResponse = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
  };

  const NEXT = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    User.findByPk.mockResolvedValue({ id: 42, name: 'Empresa Teste' });
    NEXT.mockReset();
  });

  it('permite acesso quando o plano é elegível', async () => {
    Subscription.findOne.mockResolvedValue({
      plan: { key: 'prata' },
      expiresAt: new Date(Date.now() + 86400000),
      update: jest.fn(),
    });

    const middleware = requirePlan(['prata', 'ouro']);
    const req = { user: { userId: 42 } };
    const res = buildResponse();

    await middleware(req, res, NEXT);

    expect(NEXT).toHaveBeenCalled();
    expect(req.businessUser).toBeDefined();
    expect(req.businessSubscription).toBeDefined();
  });

  it('bloqueia acesso para planos não elegíveis', async () => {
    Subscription.findOne.mockResolvedValue({
      plan: { key: 'bronze' },
      expiresAt: new Date(Date.now() + 86400000),
      update: jest.fn(),
    });

    const middleware = requirePlan(['prata', 'ouro']);
    const req = { user: { userId: 42 } };
    const res = buildResponse();

    await middleware(req, res, NEXT);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Assinatura atual não permite acessar este recurso.',
    });
    expect(NEXT).not.toHaveBeenCalled();
  });
});
