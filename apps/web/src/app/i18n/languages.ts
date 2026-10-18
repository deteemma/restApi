/** Langues de l'interface. Chacune est nommée dans sa propre langue (pas de drapeau : une langue n'est pas un pays). */
export const LANGUAGES = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

/** Langue de référence des traductions, et langue de repli. */
export const DEFAULT_LANGUAGE: LanguageCode = 'fr';

export const LANGUAGE_CODES: readonly LanguageCode[] = LANGUAGES.map((l) => l.code);

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && (LANGUAGE_CODES as readonly string[]).includes(value);
}

/**
 * Ordre de choix : la langue mémorisée, puis la première langue du navigateur prise en charge
 * (« de-CH » donne « de »), et à défaut le français.
 */
export function resolveInitialLanguage(
  stored: string | null,
  browserLanguages: readonly string[],
): LanguageCode {
  if (isLanguageCode(stored)) return stored;
  for (const tag of browserLanguages) {
    const primary = tag.split('-')[0]?.toLowerCase();
    if (isLanguageCode(primary)) return primary;
  }
  return DEFAULT_LANGUAGE;
}
