export const DIACRITIC_REGEX = /[\u0300-\u036f]/g;
export const SLUG_ALLOWED_REGEX = /[^a-z0-9]+/g;
export const TRAILING_DASH_REGEX = /^-+|-+$/g;

export function slugifyBusinessName(value) {
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

export function buildBusinessSlug(businessLike) {
  if (!businessLike) {
    return 'empresa';
  }

  const base = slugifyBusinessName(
    businessLike.businessName || businessLike.name || `empresa-${businessLike.id || ''}`,
  );
  const id = Number(businessLike.id);

  return Number.isInteger(id) && id > 0 ? `${base}-${id}` : base;
}
