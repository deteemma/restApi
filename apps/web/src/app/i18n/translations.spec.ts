import { ErrorCode, StepErrorCode } from '@restapi/shared';
import deTranslations from '../../../public/i18n/de.json';
import enTranslations from '../../../public/i18n/en.json';
import frTranslations from '../../../public/i18n/fr.json';
import itTranslations from '../../../public/i18n/it.json';
import { DEFAULT_LANGUAGE, LANGUAGE_CODES } from './languages';

type Tree = { [key: string]: string | Tree };

const translations: Record<string, Tree> = {
  fr: frTranslations,
  en: enTranslations,
  de: deTranslations,
  it: itTranslations,
};

/** Aplatit { a: { b: 'x' } } en { 'a.b': 'x' }. */
function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

const reference = flatten(translations[DEFAULT_LANGUAGE]!);

describe('complétude des traductions', () => {
  it('fournit un fichier pour chaque langue prise en charge', () => {
    expect(Object.keys(translations).sort()).toEqual([...LANGUAGE_CODES].sort());
  });

  for (const lang of LANGUAGE_CODES.filter((l) => l !== DEFAULT_LANGUAGE)) {
    describe(lang, () => {
      const keys = flatten(translations[lang]!);

      it(`contient toutes les clés de « ${DEFAULT_LANGUAGE} »`, () => {
        expect([...reference.keys()].filter((k) => !keys.has(k))).toEqual([]);
      });

      it(`ne contient aucune clé absente de « ${DEFAULT_LANGUAGE} »`, () => {
        expect([...keys.keys()].filter((k) => !reference.has(k))).toEqual([]);
      });

      it('garde les mêmes paramètres {{ … }} que la référence', () => {
        const params = (s: string) => [...s.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();
        const mismatches = [...reference].filter(
          ([k, v]) => keys.has(k) && params(v).join() !== params(keys.get(k)!).join(),
        );
        expect(mismatches.map(([k]) => k)).toEqual([]);
      });
    });
  }

  it("n'a aucune traduction vide", () => {
    const empty = LANGUAGE_CODES.flatMap((lang) =>
      [...flatten(translations[lang]!)].filter(([, v]) => !v.trim()).map(([k]) => `${lang}:${k}`),
    );
    expect(empty).toEqual([]);
  });

  it("traduit chaque code d'échec d'une Étape", () => {
    const missing = Object.values(StepErrorCode).filter(
      (code) => !reference.has(`stepErrors.${code}`),
    );
    expect(missing).toEqual([]);
  });

  it("traduit chaque code d'erreur de l'API", () => {
    const missing = Object.values(ErrorCode).filter((code) => !reference.has(`errors.${code}`));
    expect(missing).toEqual([]);
  });
});
