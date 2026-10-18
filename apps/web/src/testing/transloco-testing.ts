import { TranslocoTestingModule } from '@jsverse/transloco';
import deTranslations from '../../public/i18n/de.json';
import enTranslations from '../../public/i18n/en.json';
import frTranslations from '../../public/i18n/fr.json';
import itTranslations from '../../public/i18n/it.json';
import { DEFAULT_LANGUAGE, LANGUAGE_CODES } from '../app/i18n/languages';

/** Transloco avec les vraies traductions, chargées sans HTTP. */
export function translocoTesting() {
  return TranslocoTestingModule.forRoot({
    langs: { fr: frTranslations, en: enTranslations, de: deTranslations, it: itTranslations },
    translocoConfig: {
      availableLangs: [...LANGUAGE_CODES],
      defaultLang: DEFAULT_LANGUAGE,
      reRenderOnLangChange: true,
    },
    preloadLangs: true,
  });
}
