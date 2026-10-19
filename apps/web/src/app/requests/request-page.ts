import { ChangeDetectionStrategy, Component, effect, inject, input, resource } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiClient } from '../core/api-client';
import { Notifier } from '../core/notifier';
import { MethodBadge } from '../shared/ui/method-badge';

/** Page d'une Requête. L'éditeur complet arrive avec la livraison L5. */
@Component({
  selector: 'app-request-page',
  imports: [TranslocoPipe, MethodBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../shared/ui/page.scss',
  template: `
    @if (request.value(); as r) {
      <div class="title-row">
        <app-method-badge [method]="r.method" />
        <h1>{{ r.name }}</h1>
      </div>
      <p class="meta">
        <code>{{ r.url }}</code>
      </p>
      <div class="placeholder">{{ 'requestPage.placeholder' | transloco }}</div>
    }
  `,
})
export class RequestPage {
  /** Paramètre de route. */
  readonly requestId = input.required<string>();

  private readonly api = inject(ApiClient);
  private readonly notifier = inject(Notifier);

  protected readonly request = resource({
    params: () => ({ id: this.requestId() }),
    loader: ({ params }) => this.api.getRequest(params.id),
  });

  constructor() {
    effect(() => {
      const error = this.request.error();
      if (error) this.notifier.error(error);
    });
  }
}
