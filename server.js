const config = require('./src/config/config');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');

const sequelize = require('./src/config/database');
const authRoutes = require('./src/routes/authRoutes');
const serviceRoutes = require('./src/routes/serviceRoutes');
const businessHoursRoutes = require('./src/routes/businessHoursRoutes');
const appointmentRoutes = require('./src/routes/appointmentRoutes');
const publicRoutes = require('./src/routes/publicRoutes');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const planRoutes = require('./src/routes/planRoutes');
const subscriptionRoutes = require('./src/routes/subscriptionRoutes');
const businessRoutes = require('./src/routes/businessRoutes');

const stripeRoutes = require('./src/routes/stripeRoutes');
const stripeController = require('./src/controllers/stripeController');

const seedPlans = require('./src/scripts/seedPlans');

const app = express();
const PORT = config.port;

/**
 * ⚠️ IMPORTANTE: o Webhook do Stripe deve vir ANTES de express.json()
 * Usamos express.raw para que a verificação de assinatura funcione.
 */
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    // Logs de diagnóstico
    console.log('👉  [Stripe] webhook HIT', new Date().toISOString());
    console.log('   - Has stripe-signature header?', !!req.headers['stripe-signature']);
    console.log('   - Content-Type:', req.headers['content-type']);
    try {
      console.log('   - Raw length:', req.body?.length || (Buffer.isBuffer(req.body) ? req.body.length : 'n/a'));
    } catch (_) {}
    next();
  },
  stripeController.handleWebhook
);

// Middlewares para as demais rotas
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// CORS (ajuste conforme necessário)
app.use((req, res, next) => {
  const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];
  const origin = req.headers.origin;

  if (config.env === 'development' || allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  } else if (config.env === 'production') {
    res.header('Access-Control-Allow-Origin', '*');
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Ping de diagnóstico (GET) para conferir caminho
app.get('/api/stripe/webhook/ping', (req, res) => {
  res.json({ ok: true, path: '/api/stripe/webhook', now: new Date().toISOString() });
});

// Rotas comuns
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/stripe', stripeRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/servicos', serviceRoutes);
app.use('/api/business-hours', businessHoursRoutes);
app.use('/api', planRoutes);
app.use('/api', subscriptionRoutes);
app.use('/api', appointmentRoutes);
app.use('/api', publicRoutes);
app.use('/api', businessRoutes);
app.use('/api/dashboard', dashboardRoutes);

sequelize.sync({ alter: true })
  .then(async () => {
    console.log('DB ok. Subindo servidor...');
    await (typeof seedPlans === 'function' ? seedPlans() : null);
    app.listen(PORT, '0.0.0.0', () => console.log(`HTTP ${PORT}`));
  })
  .catch(err => {
    console.error('Erro DB:', err);
    process.exit(1);
  });
