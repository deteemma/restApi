import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoService } from '@jsverse/transloco';
import { apiErrorCode } from './api-error';

/** Messages brefs en bas de l'écran, toujours traduits. */
@Injectable({ providedIn: 'root' })
export class Notifier {
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  success(key: string, params?: Record<string, unknown>): void {
    this.snackBar.open(this.transloco.translate(key, params), undefined, { duration: 3000 });
  }

  /** Message d'échec traduit, quand l'erreur ne vient pas de l'API. */
  failure(key: string, params?: Record<string, unknown>): void {
    const message = this.transloco.translate(key, params);
    this.snackBar.open(message, this.transloco.translate('common.close'), { duration: 6000 });
  }

  /** Affiche la traduction du code d'erreur de l'API, ou un message générique. */
  error(error: unknown): void {
    const code = apiErrorCode(error);
    if (!code) console.error(error);
    const message = this.transloco.translate(code ? `errors.${code}` : 'common.unexpectedError');
    this.snackBar.open(message, this.transloco.translate('common.close'), { duration: 6000 });
  }
}
