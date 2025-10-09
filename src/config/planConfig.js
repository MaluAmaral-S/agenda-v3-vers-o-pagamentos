const DEFAULT_LIMITS = {
  bronze: 20,
  prata: 60, // MUDANÇA AQUI
  ouro: 200, // MUDANÇA AQUI
};

const DEFAULT_NAMES = {
  bronze: 'Bronze',
  prata: 'Prata', // MUDANÇA AQUI
  ouro: 'Ouro', // MUDANÇA AQUI
};

const PLAN_KEYS = Object.keys(DEFAULT_LIMITS);

const parseInteger = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const getLimitFromEnv = (planKey) => {
  const envVar = `PLAN_${planKey.toUpperCase()}_LIMIT`;
  return parseInteger(process.env[envVar], DEFAULT_LIMITS[planKey]);
};

const getSubscriptionDurationDays = () => {
  return parseInteger(process.env.SUBSCRIPTION_DURATION_DAYS, 30);
};

const getPlanConfig = () => {
  return PLAN_KEYS.map((key) => ({
    key,
    name: DEFAULT_NAMES[key],
    monthlyLimit: getLimitFromEnv(key),
  }));
};

const getPlanLimit = (planKey, fallback) => {
  if (!PLAN_KEYS.includes(planKey)) {
    return fallback ?? null;
  }
  return getLimitFromEnv(planKey) ?? fallback ?? null;
};

module.exports = {
  PLAN_KEYS,
  DEFAULT_NAMES,
  DEFAULT_LIMITS,
  getPlanConfig,
  getPlanLimit,
  getSubscriptionDurationDays,
};
