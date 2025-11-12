import { Zap, Star, Crown } from 'lucide-react';

// Shared plan UI data and helpers used by Home and Planos pages

export const ICONS = {
  zap: Zap,
  star: Star,
  crown: Crown,
};

export const PLAN_ORDER = ['bronze', 'silver', 'gold'];

export const PLAN_UI_DATA = {
  bronze: {
    key: 'bronze',
    name: 'Bronze',
    title: 'Plano Bronze',
    description: 'Recursos essenciais para começar a usar o Agende-mi.',
    priceLabel: 'R$ 39,90',
    icon: 'zap',
    badge: null,
    gradientClass:
      'bg-[radial-gradient(circle_at_20%_20%,rgba(255,217,182,0.85),rgba(136,84,24,0.95)_45%,rgba(58,33,10,0.98))]',
    featureTemplate: [
      'Até {{limit}} agendamentos mensais',
      '1 agenda de profissional',
      'Confirmações por e-mail',
    ],
    ctaLabel: 'Assinar Bronze',
    defaultLimit: 20,
  },
  silver: {
    key: 'silver',
    name: 'Prata',
    title: 'Plano Prata',
    description: 'O equilíbrio ideal entre capacidade e autonomia.',
    priceLabel: 'R$ 79,90',
    icon: 'star',
    badge: 'Mais escolhido',
    gradientClass:
      'bg-[radial-gradient(circle_at_20%_20%,rgba(245,245,247,0.9),rgba(168,174,186,0.95)_45%,rgba(82,88,99,0.98))]',
    featureTemplate: [
      'Até {{limit}} agendamentos mensais',
      'Até 5 agendas de profissionais',
      'Suporte prioritário em horário comercial',
    ],
    ctaLabel: 'Assinar Prata',
    defaultLimit: 60,
  },
  gold: {
    key: 'gold',
    name: 'Ouro',
    title: 'Plano Ouro',
    description: 'Para equipes que precisam operar sem limites.',
    priceLabel: 'Fale com o time',
    icon: 'crown',
    badge: 'Experiência premium',
    gradientClass:
      'bg-[radial-gradient(circle_at_20%_20%,rgba(252,244,195,0.9),rgba(214,175,38,0.95)_45%,rgba(104,78,23,0.98))]',
    featureTemplate: [
      'Até {{limit}} agendamentos mensais',
      'Usuários ilimitados',
      'Suporte dedicado com SLA customizado',
    ],
    ctaLabel: 'Assinar Ouro',
    defaultLimit: 200,
  },
};

export const buildFeatures = (planKey, limit) => {
  const template = PLAN_UI_DATA[planKey]?.featureTemplate ?? [];
  const normalizedLimit = limit && limit > 0 ? limit.toLocaleString('pt-BR') : 'agendamentos ilimitados';
  return template.map((feature) => feature.replace('{{limit}}', normalizedLimit));
};

export const formatLimitLabel = (limit) => {
  if (!limit || limit <= 0) {
    return 'Agendamentos ilimitados por mês';
  }
  return `${limit.toLocaleString('pt-BR')} agendamentos por mês`;
};

export const composePlanList = (plansMap = new Map()) =>
  PLAN_ORDER.map((key) => {
    const uiPlan = PLAN_UI_DATA[key];
    const backendPlan = plansMap.get ? plansMap.get(key) ?? {} : {};
    const monthlyLimit = backendPlan.monthlyLimit ?? uiPlan.defaultLimit;
    const displayName = backendPlan.name ?? uiPlan.name;

    return {
      ...uiPlan,
      key,
      name: displayName,
      monthlyLimit,
      features: buildFeatures(key, monthlyLimit),
    };
  });

