import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import type { SendDto } from '@restapi/shared';
import { AppDatePipe } from '../shared/ui/app-date.pipe';
import { ResponseDetails } from './response-details';

/** Réponse du dernier Envoi d'une Requête, avec l'historique des Envois. */
@Component({
  selector: 'app-response-viewer',
  imports: [MatProgressBarModule, MatSelectModule, TranslocoPipe, AppDatePipe, ResponseDetails],
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

  protected readonly send = computed<SendDto | null>(
    () => this.sends().find((s) => s.id === this.selectedId()) ?? this.sends()[0] ?? null,
  );
}
