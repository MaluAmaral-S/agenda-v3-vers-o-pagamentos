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
const ENV_LIMIT_KEYS = {
  bronze: ['PLAN_BRONZE_LIMIT', 'PLAN_BASIC_LIMIT'],
  prata: ['PLAN_PRATA_LIMIT', 'PLAN_SILVER_LIMIT'],
  ouro: ['PLAN_OURO_LIMIT', 'PLAN_GOLD_LIMIT'],
};

const parseInteger = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const getLimitFromEnv = (planKey) => {
  const defaultValue = DEFAULT_LIMITS[planKey];
  const directVar = `PLAN_${planKey.toUpperCase()}_LIMIT`;
  const candidates = [directVar, ...(ENV_LIMIT_KEYS[planKey] || [])];

  for (const name of candidates) {
    const value = parseInteger(process.env[name], null);
    if (value !== null) {
      return value;
    }
  }

  return defaultValue;
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
