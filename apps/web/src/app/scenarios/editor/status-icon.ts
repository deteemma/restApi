import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import type { RunStatus, StepStatus } from '@restapi/shared';

const ICONS: Record<Exclude<StepStatus, 'running'>, string> = {
  pending: 'schedule',
  succeeded: 'check_circle',
  failed: 'cancel',
  skipped: 'do_not_disturb_on',
  stopped: 'stop_circle',
};

/** Icône du statut d'une Étape ou d'une Exécution (indicateur animé quand elle est en cours). */
@Component({
  selector: 'app-status-icon',
  imports: [MatIconModule, MatProgressSpinnerModule, MatTooltipModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'status()' },
  template: `
    <span
      class="icon"
      role="img"
      [attr.aria-label]="label() | transloco"
      [matTooltip]="label() | transloco"
    >
      @if (status() === 'running') {
        <mat-spinner diameter="16" strokeWidth="2.5" />
      } @else {
        <mat-icon aria-hidden="true">{{ icon() }}</mat-icon>
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
    }
    .icon {
      display: inline-flex;
    }
    mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }
    :host(.pending) {
      color: var(--mat-sys-outline);
    }
    :host(.succeeded) {
      color: light-dark(#1b7f3b, #6fdc8c);
    }
    :host(.failed) {
      color: var(--mat-sys-error);
    }
    :host(.skipped) {
      color: var(--mat-sys-on-surface-variant);
    }
    :host(.stopped) {
      color: var(--mat-sys-tertiary);
    }
  `,
})
export class StatusIcon {
  readonly status = input.required<StepStatus | RunStatus>();
  protected readonly icon = computed(() => ICONS[this.status() as Exclude<StepStatus, 'running'>]);
  protected readonly label = computed(() => `stepStatus.${this.status()}`);
}
