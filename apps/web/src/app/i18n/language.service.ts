import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { DEFAULT_LANGUAGE, type LanguageCode, resolveInitialLanguage } from './languages';

const STORAGE_KEY = 'restapi.lang';

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);

  private readonly currentLanguage = signal<LanguageCode>(DEFAULT_LANGUAGE);
  readonly current = this.currentLanguage.asReadonly();

  /** Applique la langue initiale, au démarrage de l'application. */
  init(): Promise<void> {
    const browserLanguages = this.document.defaultView?.navigator.languages ?? [];
    return this.apply(resolveInitialLanguage(this.readStored(), browserLanguages));
  }

  /** Choix explicite de l'utilisateur : on change de langue sans rechargement et on mémorise le choix. */
  async choose(lang: LanguageCode): Promise<void> {
    await this.apply(lang);
    this.writeStored(lang);
  }

  private async apply(lang: LanguageCode): Promise<void> {
    // On charge la traduction avant de basculer, pour éviter un affichage de clés brutes.
    await firstValueFrom(this.transloco.load(lang));
    this.transloco.setActiveLang(lang);
    this.currentLanguage.set(lang);
    this.document.documentElement.lang = lang;
  }

  // Le stockage peut être indisponible (navigation privée, stockage bloqué) : la langue reste alors celle de la session.
  private readStored(): string | null {
    try {
      return this.document.defaultView?.localStorage.getItem(STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  private writeStored(lang: LanguageCode): void {
    try {
      this.document.defaultView?.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Ignoré : voir readStored.
    }
  }
}
