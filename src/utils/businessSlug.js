// src/utils/businessSlug.js
// Utilitários centrais para gerar e resolver slugs públicos das empresas.
// Mantém compatibilidade com os links antigos (apenas pelo nome) mas
// garante slugs únicos e estáveis no formato "{slug-do-nome}-{id}".

const { Op } = require('sequelize');
const { User } = require('../models');

const DIACRITIC_REGEX = /[\u0300-\u036f]/g;
const TRAILING_DASH_REGEX = /^-+|-+$/g;
const SLUG_ALLOWED_REGEX = /[^a-z0-9]+/g;
const SLUG_WITH_ID_REGEX = /^(.*)-(\d+)$/;

function slugifyBusinessName(value) {
  if (!value || typeof value !== 'string') {
    return 'empresa';
  }

  const normalized = value
    .normalize('NFD')
    .replace(DIACRITIC_REGEX, '')
    .toLowerCase()
    .replace(SLUG_ALLOWED_REGEX, '-')
    .replace(TRAILING_DASH_REGEX, '');

  return normalized || 'empresa';
}

function buildBusinessSlug(businessLike) {
  if (!businessLike) {
    return 'empresa';
  }

  const maybeName =
    businessLike.businessName ||
    businessLike.name ||
    businessLike.displayName ||
    `empresa-${businessLike.id || ''}`;

  const base = slugifyBusinessName(maybeName);
  const id = Number(businessLike.id);

  if (Number.isInteger(id) && id > 0) {
    return `${base}-${id}`;
  }

  return base;
}

async function findBusinessBySlug(slug) {
  if (!slug) {
    return null;
  }

  const normalized = slug.toLowerCase();
  const match = SLUG_WITH_ID_REGEX.exec(normalized);

  if (match) {
    const id = Number(match[2]);
    if (Number.isInteger(id) && id > 0) {
      const candidate = await User.findByPk(id);
      if (candidate) {
        return candidate;
      }
    }
  }

  const searchName = normalized.replace(/-/g, ' ').trim();
  if (!searchName) {
    return null;
  }

  return User.findOne({
    where: {
      businessName: {
        [Op.iLike]: searchName,
      },
    },
  });
}

function formatBusinessPublicData(business) {
  if (!business) {
    return null;
  }

  return {
    id: business.id,
    slug: buildBusinessSlug(business),
    name: business.businessName,
    ownerName: business.name,
    businessType: business.businessType,
    email: business.email,
    phone: business.phone,
    paymentsEnabled: Boolean(business.paymentsEnabled),
    stripeChargesEnabled: Boolean(business.stripeChargesEnabled),
    stripePayoutsEnabled: Boolean(business.stripePayoutsEnabled),
    mpUserId: business.mpUserId || null,
    mpConnected: Boolean(business.mpAccessToken),
    raw: business,
  };
}

module.exports = {
  slugifyBusinessName,
  buildBusinessSlug,
  findBusinessBySlug,
  formatBusinessPublicData,
};
