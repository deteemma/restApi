import { KeyValuePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { TranslocoPipe } from '@jsverse/transloco';
import type { RequestStepResult } from '@restapi/shared';
import { CodeEditor, type CodeLanguage } from '../shared/code-editor/code-editor';
import { prettyJson } from './request-draft';

/** Résultat d'une requête : statut, durée, taille, corps, en-têtes, requête réellement envoyée. */
@Component({
  selector: 'app-response-details',
  imports: [KeyValuePipe, MatIconModule, MatTabsModule, TranslocoPipe, CodeEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './response-details.html',
  styleUrl: './response-details.scss',
})
export class ResponseDetails {
  readonly result = input.required<RequestStepResult>();

  protected readonly response = computed(() => this.result().response ?? null);

  protected readonly body = computed(() => {
    const body = this.response()?.body ?? '';
    const pretty = prettyJson(body);
    return {
      text: pretty ?? body,
      language: (pretty
        ? 'json'
        : body.trimStart().startsWith('<')
          ? 'xml'
          : 'plaintext') as CodeLanguage,
    };
  });

  /** Taille du corps : clé de traduction (octets ou Ko) et valeur. */
  protected readonly size = computed(() => {
    const bytes = new TextEncoder().encode(this.response()?.body ?? '').length;
    return bytes < 1024
      ? { key: 'response.sizeBytes', value: bytes }
      : { key: 'response.sizeKb', value: Math.round(bytes / 102.4) / 10 };
  });

  protected readonly statusClass = computed(() => {
    const status = this.response()?.status ?? 0;
    if (status >= 200 && status < 300) return 'ok';
    if (status >= 300 && status < 400) return 'redirect';
    return 'error';
  });
}
