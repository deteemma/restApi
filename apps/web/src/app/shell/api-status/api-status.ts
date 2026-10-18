import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import type { HealthResponse } from '@restapi/shared';

/** Indique si l'API répond. */
@Component({
  selector: 'app-api-status',
  imports: [MatIconModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (health.hasValue()) {
      <span class="status" role="status">
        <mat-icon aria-hidden="true">cloud_done</mat-icon>
        {{ 'shell.api.online' | transloco: { version: health.value().version } }}
      </span>
    } @else if (health.error()) {
      <span class="status offline" role="status">
        <mat-icon aria-hidden="true">cloud_off</mat-icon>
        {{ 'shell.api.offline' | transloco }}
      </span>
    }
  `,
  styles: `
    .status {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font: var(--mat-sys-label-medium);
    }
    .offline {
      color: var(--mat-sys-error);
    }
  `,
})
export class ApiStatus {
  protected readonly health = httpResource<HealthResponse>(() => '/api/health');
}
