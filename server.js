// server.js — boot com sync opcional e TODAS as rotas montadas

require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const stripeController = require('./src/controllers/stripeController');
const mercadoPagoWebhookController = require('./src/controllers/mercadoPagoWebhookController');
const mercadoPagoIntegrationController = require('./src/controllers/mercadoPagoIntegrationController');
const { validateStripeEnvironment } = require('./src/config/validateStripeEnv');

// Tenta localizar a instância do Sequelize exportada pelo projeto
function locateSequelize() {
  const candidates = [
    './src/models',            // padrão comum
    './src/database/models',   // às vezes fica aqui
    './models',                // raiz
  ];
  for (const p of candidates) {
    try {
      const mod = require(p);
      if (mod?.sequelize) return mod.sequelize;
      if (mod?.default?.sequelize) return mod.default.sequelize;
    } catch (_) { /* tenta o próximo */ }
  }
  return null;
}

let sequelize = locateSequelize();

// Se não houver export do projeto, cria uma instância fallback via .env
if (!sequelize) {
  console.warn('[boot] Nenhuma instância exportada encontrada; criando Sequelize via .env');
  const { Sequelize } = require('sequelize');
  sequelize = new Sequelize(
    process.env.DB_NAME || 'agenda',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASS || '',
    {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      dialect: process.env.DB_DIALECT || 'postgres',
      logging: false,
    }
  );
}

const app = express();

validateStripeEnvironment();

// --- Stripe webhook (usa raw body, deve vir antes do json parser) ---
const stripeWebhookHandler = typeof stripeController?.handleWebhook === 'function'
  ? stripeController.handleWebhook
  : (_req, res) => res.status(501).json({ error: 'Stripe webhook handler indispon��vel.' });
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookHandler);
// Compatibilidade temporária com a rota antiga
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

// Mercado Pago webhook (usa raw body para validar x-signature)
app.post(
  '/api/webhooks/mercadopago',
  express.raw({ type: '*/*', limit: '1mb' }),
  mercadoPagoWebhookController.handleNotification
);

// Callback OAuth Mercado Pago (aceita GET/POST)
const mercadopagoOAuthParsers = [
  express.urlencoded({ extended: true }),
  express.json({ limit: '1mb', type: ['application/json', 'application/*+json'] }),
];
app.all(
  '/api/integrations/mercadopago/oauth/callback',
  ...mercadopagoOAuthParsers,
  mercadoPagoIntegrationController.handleOAuthCallback
);

// --- Body parsers ---
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// --- Cookies ---
app.use(cookieParser());

// --- CORS ---
const origins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim());

app.use(cors({
  origin: function(origin, cb) {
    if (!origin) return cb(null, true); // Postman/cURL
    if (origins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS: ' + origin));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

// --- Log simples para debug de rotas ---
app.use((req, _res, next) => { console.log('[REQ]', req.method, req.path); next(); });

// --- Rotas ---
// IMPORTANT: Monte rotas públicas ANTES de qualquer router que aplique 'protect' via router.use()
// Rotas públicas de agendamento (/api/public/...)
app.use('/api/public', require('./src/routes/publicRoutes'));

// Auth
app.use('/api/auth', require('./src/routes/authRoutes'));

// Dashboard (/api/dashboard/stats)
app.use('/api/dashboard', require('./src/routes/dashboardRoutes'));

// Subscriptions (/api/subscriptions, /api/subscriptions/me)
app.use('/api', require('./src/routes/subscriptionRoutes'));

// Business hours (/api/business-hours)
app.use('/api/business-hours', require('./src/routes/businessHoursRoutes'));

// Pagamentos (Checkout Pro + APIs legadas)
// Para evitar confusões no frontend (rota inexistente causando 401), montamos todas
// as rotas de pagamentos de Mercado Pago diretamente em `/api/payments`. Isso
// garante que `POST /api/payments/checkout-pro` seja tratado corretamente pelo
// backend independentemente da ordem de montagem. As rotas legadas
// continuam disponíveis através de paymentRoutes. Caso haja sobreposição de
// caminhos (por exemplo, `checkout-pro`), o primeiro router a definir a rota
// será utilizado.
app.use('/api/payments', require('./src/routes/paymentRoutes'));
app.use('/api/payments', require('./src/routes/mercadoPagoPaymentRoutes'));

// Appointments (/api/agendamentos, /api/empresa/:id/agendamentos, etc.)
app.use('/api', require('./src/routes/appointmentRoutes'));

// Rotas públicas de negócio (/api/business/:slug, /api/booking)
app.use('/api', require('./src/routes/businessRoutes'));

// Service routes (/api/servicos)
// Montamos com o prefixo /api/servicos para que o caminho final seja
// /api/servicos e /api/servicos/:id, conforme utilizado no frontend.
app.use('/api/servicos', require('./src/routes/serviceRoutes'));

// Plan routes (/api/plans)
// Montamos no prefixo /api para que a rota interna '/plans' seja exposta como
// /api/plans, conforme definido em API_ROUTES.SUBSCRIPTIONS.PLANS no frontend.
app.use('/api', require('./src/routes/planRoutes'));

// Stripe routes (/api/stripe)
// Responsáveis por iniciar sessões de checkout e portal. Montadas em /api/stripe
// para que as rotas '/create-checkout-session' e '/create-portal-session' fiquem
// acessíveis em /api/stripe/create-checkout-session e /api/stripe/create-portal-session.
app.use('/api/stripe/connect', require('./src/routes/stripeConnectRoutes'));
app.use('/api/stripe/payments', require('./src/routes/stripePaymentRoutes'));
app.use('/api/stripe', require('./src/routes/stripeRoutes'));
app.use('/api/integrations/mercadopago', require('./src/routes/mercadoPagoIntegrationRoutes'));

// --- Health ---
app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/health/mp', (_req, res) => res.json({
  redirectUri: process.env.MP_OAUTH_REDIRECT_URI || `${process.env.SERVER_URL || 'http://localhost:3000'}/api/integrations/mercadopago/oauth/callback`,
  webhookUrl: process.env.MP_WEBHOOK_PUBLIC_URL || `${process.env.SERVER_URL || 'http://localhost:3000'}/api/webhooks/mercadopago`,
}));

// --- Frontend estático (build do Vite) ---
const frontendDistPath = path.join(__dirname, 'frontend', 'dist');
app.use(express.static(frontendDistPath));

app.use((req, res, next) => {
  const target = req.originalUrl || req.url || '';
  if (
    target.startsWith('/api') ||
    target.startsWith('/webhooks') ||
    target.startsWith('/health')
  ) {
    return next();
  }

  if (req.method !== 'GET') {
    return next();
  }

  return res.sendFile(path.join(frontendDistPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;

// --------- Boot com sync controlado por ENV ---------
const SYNC = (process.env.DB_SYNC || 'off').toLowerCase(); // 'off' | 'alter' | 'force'

(async () => {
  try {
    console.log('[boot] autenticando no banco...');
    await sequelize.authenticate();
    console.log('[boot] OK');

    if (SYNC === 'force') {
      console.warn('[boot] DB_SYNC=force -> DROPAR e RECRIAR tabelas (⚠️ destrutivo)');
      await sequelize.sync({ force: true, logging: false });
    } else if (SYNC === 'alter') {
      console.log('[boot] DB_SYNC=alter -> criar/alterar tabelas que faltam');
      await sequelize.sync({ alter: true, logging: false });
    } else {
      console.log('[boot] DB_SYNC=off -> sem sync (usa tabelas existentes)');
      // opcional: await sequelize.sync({ logging: false });
    }

    // (opcional) seed inicial
    try {
      const seedPlans = require('./src/scripts/seedPlans');
      if (typeof seedPlans === 'function') {
        console.log('[boot] executando seedPlans...');
        await seedPlans(); // idempotente
        console.log('[boot] seedPlans OK');
      }
    } catch (_) {}

    app.listen(PORT, '0.0.0.0', () => console.log(`HTTP ${PORT}`));
  } catch (err) {
    console.error('Erro DB:', err);
    process.exit(1);
  }
})();
