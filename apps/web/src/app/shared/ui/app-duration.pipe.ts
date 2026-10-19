import { Pipe, type PipeTransform, inject } from '@angular/core';
import { LanguageService } from '../../i18n/language.service';
import { formatDuration } from './duration';

/** Durée en millisecondes, au format de la langue active (impur : suit le changement de langue). */
@Pipe({ name: 'appDuration', pure: false })
export class AppDurationPipe implements PipeTransform {
  private readonly language = inject(LanguageService);

  transform(ms: number | null | undefined): string {
    return ms === null || ms === undefined ? '' : formatDuration(ms, this.language.current());
  }
}
