import { KeyValuePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { TranslocoPipe } from '@jsverse/transloco';
import type { SendDto } from '@restapi/shared';
import { CodeEditor, type CodeLanguage } from '../shared/code-editor/code-editor';
import { AppDatePipe } from '../shared/ui/app-date.pipe';
import { prettyJson } from './request-draft';

/** Réponse d'un Envoi, avec la requête réellement envoyée et l'historique des Envois. */
@Component({
  selector: 'app-response-viewer',
  imports: [
    KeyValuePipe,
    MatIconModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTabsModule,
    TranslocoPipe,
    AppDatePipe,
    CodeEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './response-viewer.html',
  styleUrl: './response-viewer.scss',
})
export class ResponseViewer {
  /** Envois, du plus récent au plus ancien. */
  readonly sends = input.required<readonly SendDto[]>();
  readonly selectedId = input<string | null>(null);
  readonly sending = input(false);
  readonly selectedIdChange = output<string>();

  protected readonly send = computed(
    () => this.sends().find((s) => s.id === this.selectedId()) ?? this.sends()[0] ?? null,
  );
  protected readonly response = computed(() => this.send()?.result.response ?? null);

  protected readonly body = computed(() => {
    const body = this.response()?.body ?? '';
    const pretty = prettyJson(body);
    return {
      text: pretty ?? body,
      language: (pretty ? 'json' : guessLanguage(body)) as CodeLanguage,
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

function guessLanguage(body: string): CodeLanguage {
  return body.trimStart().startsWith('<') ? 'xml' : 'plaintext';
}
