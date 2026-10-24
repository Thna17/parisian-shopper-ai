export function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function normalizeIdentity(value: string): string {
  return normalizeText(value);
}

export function normalizeDecimal(value: string): string {
  const normalized = value.replace(',', '.');
  const [integer = '0', fraction = ''] = normalized.split('.');
  const trimmed = fraction.replace(/0+$/u, '');
  return trimmed.length === 0
    ? integer.replace(/^0+(?=\d)/u, '') || '0'
    : `${integer.replace(/^0+(?=\d)/u, '') || '0'}.${trimmed}`;
}

export function normalizeSize(value: string, unit: string): string {
  return `${normalizeDecimal(value)} ${normalizeText(unit)}`;
}

const CONCENTRATION_ALIASES: Readonly<Record<string, string>> = {
  edp: 'EDP',
  'eau de parfum': 'EDP',
  edt: 'EDT',
  'eau de toilette': 'EDT',
  parfum: 'PARFUM',
  perfume: 'PARFUM',
};

export function normalizeConcentration(value: string): string | null {
  const normalized = normalizeText(value);
  const exact = CONCENTRATION_ALIASES[normalized];
  if (exact !== undefined) return exact;

  if (/\b(?:eau\s+de\s+parfum|edp)\b/u.test(normalized)) return 'EDP';
  if (/\b(?:eau\s+de\s+toilette|edt)\b/u.test(normalized)) return 'EDT';
  if (/\b(?:parfum|perfume|extrait)\b/u.test(normalized)) return 'PARFUM';

  return null;
}

const COUNTRY_ALIASES: Readonly<Record<string, string>> = {
  france: 'FR',
  french: 'FR',
  បារាំង: 'FR',
  cambodia: 'KH',
  cambodian: 'KH',
  កម្ពុជា: 'KH',
};

export function normalizeCountry(value: string): string | null {
  const normalized = normalizeText(value);
  if (/^[a-z]{2}$/u.test(normalized)) return normalized.toUpperCase();
  return COUNTRY_ALIASES[normalized] ?? null;
}

export function normalizeFragranceNote(value: string): string {
  return normalizeText(value);
}
