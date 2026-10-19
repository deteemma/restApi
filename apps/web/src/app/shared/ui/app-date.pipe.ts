import { Pipe, type PipeTransform, inject } from '@angular/core';
import { LanguageService } from '../../i18n/language.service';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(lang: string, style: 'short' | 'medium'): Intl.DateTimeFormat {
  const key = `${lang}:${style}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(lang, { dateStyle: style, timeStyle: 'short' });
    formatters.set(key, f);
  }
  return f;
}

/**
 * Date et heure au format de la langue active de l'interface.
 * Impur : le résultat change quand l'utilisateur change de langue.
 */
@Pipe({ name: 'appDate', pure: false })
export class AppDatePipe implements PipeTransform {
  private readonly language = inject(LanguageService);

  transform(value: string | Date | null | undefined, style: 'short' | 'medium' = 'medium'): string {
    if (!value) return '';
    return formatter(this.language.current(), style).format(new Date(value));
  }
}
