import { ChangeDetectionStrategy, Component, effect, inject, input, resource } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiClient } from '../core/api-client';
import { Notifier } from '../core/notifier';

/** Page d'un Scénario. L'éditeur en arbre arrive avec la livraison L6. */
@Component({
  selector: 'app-scenario-page',
  imports: [MatIconModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../shared/ui/page.scss',
  template: `
    @if (scenario.value(); as s) {
      <div class="title-row">
        <mat-icon>account_tree</mat-icon>
        <h1>{{ s.name }}</h1>
      </div>
      <p class="meta">{{ 'scenarioPage.steps' | transloco: { count: s.root.steps.length } }}</p>
      <div class="placeholder">{{ 'scenarioPage.placeholder' | transloco }}</div>
    }
  `,
})
export class ScenarioPage {
  /** Paramètre de route. */
  readonly scenarioId = input.required<string>();

  private readonly api = inject(ApiClient);
  private readonly notifier = inject(Notifier);

  protected readonly scenario = resource({
    params: () => ({ id: this.scenarioId() }),
    loader: ({ params }) => this.api.getScenario(params.id),
  });

  constructor() {
    effect(() => {
      const error = this.scenario.error();
      if (error) this.notifier.error(error);
    });
  }
}
