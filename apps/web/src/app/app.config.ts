import { provideHttpClient } from '@angular/common/http';
import {
  type ApplicationConfig,
  inject,
  isDevMode,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { provideRouter, withComponentInputBinding, withRouterConfig } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';
import { routes } from './app.routes';
import { LanguageService } from './i18n/language.service';
import { DEFAULT_LANGUAGE, LANGUAGE_CODES } from './i18n/languages';
import { TranslocoHttpLoader } from './i18n/transloco-loader';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Les paramètres de route arrivent en `input()` ; les pages filles héritent de collectionId.
    provideRouter(
      routes,
      withComponentInputBinding(),
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
    ),
    provideHttpClient(),
    provideTransloco({
      config: {
        availableLangs: [...LANGUAGE_CODES],
        defaultLang: DEFAULT_LANGUAGE,
        fallbackLang: DEFAULT_LANGUAGE,
        missingHandler: { useFallbackTranslation: true },
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
    provideAppInitializer(() => {
      // Icônes servies localement par le paquet material-symbols : l'application fonctionne hors ligne.
      inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
      return inject(LanguageService).init();
    }),
  ],
};
