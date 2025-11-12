// server.js — boot com sync opcional e TODAS as rotas montadas

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const stripeController = require('./src/controllers/stripeController');

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

// --- Stripe webhook (usa raw body, deve vir antes do json parser) ---
const stripeWebhookHandler = typeof stripeController?.handleWebhook === 'function'
  ? stripeController.handleWebhook
  : (_req, res) => res.status(501).json({ error: 'Stripe webhook handler indispon��vel.' });
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);

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
// Auth
app.use('/api/auth', require('./src/routes/authRoutes'));

// Dashboard (/api/dashboard/stats)
app.use('/api/dashboard', require('./src/routes/dashboardRoutes'));

// Subscriptions (/api/subscriptions, /api/subscriptions/me)
app.use('/api', require('./src/routes/subscriptionRoutes'));

// Business hours (/api/business-hours)
app.use('/api/business-hours', require('./src/routes/businessHoursRoutes'));

// Appointments (/api/agendamentos, /api/empresa/:id/agendamentos, etc.)
app.use('/api', require('./src/routes/appointmentRoutes'));

// Rotas públicas de negócio (/api/business/:slug, /api/booking)
app.use('/api', require('./src/routes/businessRoutes'));

// Service routes (/api/servicos)
// Montamos com o prefixo /api/servicos para que o caminho final seja
// /api/servicos e /api/servicos/:id, conforme utilizado no frontend.
app.use('/api/servicos', require('./src/routes/serviceRoutes'));

// Rotas públicas de agendamento (/api/public/...)
app.use('/api/public', require('./src/routes/publicRoutes'));

// Plan routes (/api/plans)
// Montamos no prefixo /api para que a rota interna '/plans' seja exposta como
// /api/plans, conforme definido em API_ROUTES.SUBSCRIPTIONS.PLANS no frontend.
app.use('/api', require('./src/routes/planRoutes'));

// Stripe routes (/api/stripe)
// Responsáveis por iniciar sessões de checkout e portal. Montadas em /api/stripe
// para que as rotas '/create-checkout-session' e '/create-portal-session' fiquem
// acessíveis em /api/stripe/create-checkout-session e /api/stripe/create-portal-session.
app.use('/api/stripe', require('./src/routes/stripeRoutes'));

// --- Health ---
app.get('/health', (_req, res) => res.json({ ok: true }));

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
