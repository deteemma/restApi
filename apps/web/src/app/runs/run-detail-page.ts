import { KeyValuePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { RunDto } from '@restapi/shared';
import { ApiClient } from '../core/api-client';
import { Notifier } from '../core/notifier';
import { WorkspaceStore } from '../core/workspace.store';
import type { RequestSummary } from '../collections/request-tree';
import { ScenarioTreeView } from '../scenarios/editor/scenario-tree-view';
import { StatusIcon } from '../scenarios/editor/status-icon';
import { StepResult } from '../scenarios/editor/step-result';
import { RunTracker } from '../scenarios/run-tracker';
import { runStateFromRun } from '../scenarios/run-state';
import { AppDatePipe } from '../shared/ui/app-date.pipe';
import { AppDurationPipe } from '../shared/ui/app-duration.pipe';

/**
 * Détail d'une Exécution : l'arbre de son Instantané (tel qu'il a été lancé) et le résultat de
 * chaque Étape. Une Exécution encore en cours est suivie en direct.
 */
@Component({
  selector: 'app-run-detail-page',
  imports: [
    KeyValuePipe,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    RouterLink,
    TranslocoPipe,
    AppDatePipe,
    AppDurationPipe,
    ScenarioTreeView,
    StatusIcon,
    StepResult,
  ],
  providers: [RunTracker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './run-detail-page.html',
  styleUrl: './run-detail-page.scss',
})
export class RunDetailPage {
  /** Paramètres de route. */
  readonly runId = input.required<string>();
  readonly collectionId = input.required<string>();

  private readonly api = inject(ApiClient);
  private readonly store = inject(WorkspaceStore);
  private readonly notifier = inject(Notifier);
  protected readonly tracker = inject(RunTracker);

  protected readonly run = resource({
    params: () => ({ id: this.runId() }),
    loader: ({ params }) => this.api.getRun(params.id),
  });
  /** Épinglage modifié depuis cette page (sinon celui de l'Exécution chargée). */
  private readonly pinnedOverride = signal<boolean | null>(null);
  protected readonly pinned = computed(
    () => this.pinnedOverride() ?? this.run.value()?.pinned ?? false,
  );

  /** En direct si l'Exécution tourne encore, sinon l'état enregistré. */
  protected readonly state = computed(() => {
    const live = this.tracker.state();
    if (live) return live;
    const run = this.run.value();
    return run ? runStateFromRun(run) : null;
  });

  /** Les Requêtes telles qu'elles étaient au lancement (Instantané). */
  protected readonly requests = computed<RequestSummary[]>(() =>
    Object.values(this.run.value()?.snapshot.requests ?? {}).map((r) => ({
      id: r.id,
      name: r.name,
      method: r.method,
      folderId: null,
    })),
  );

  protected readonly selectedId = signal<string | null>(null);
  protected readonly selected = computed(() => {
    const id = this.selectedId();
    return id ? (this.state()?.steps[id] ?? null) : null;
  });

  /** Le Scénario existe-t-il encore (lien « Ouvrir le Scénario ») ? */
  protected readonly scenarioExists = computed(() => {
    const run = this.run.value();
    return !!run && !!this.store.tree()?.scenarios.some((s) => s.id === run.scenarioId);
  });

  constructor() {
    effect(() => {
      const run = this.run.value();
      if (!run) return;
      untracked(() => {
        this.pinnedOverride.set(null);
        this.selectedId.set(firstFailedStep(run) ?? run.snapshot.scenario.root.id);
        if (run.status === 'running') this.tracker.follow(run, run.snapshot.scenario.root);
        else this.tracker.clear();
      });
    });
    effect(() => {
      const error = this.run.error();
      if (error) this.notifier.error(error);
    });
  }

  protected async togglePin(): Promise<void> {
    try {
      const updated = await this.api.setRunPinned(this.runId(), !this.pinned());
      this.pinnedOverride.set(updated.pinned);
    } catch (e) {
      this.notifier.error(e);
    }
  }
}

/** L'Étape-requête échouée à montrer d'emblée, s'il y en a une. */
function firstFailedStep(run: RunDto): string | null {
  return run.steps.find((s) => s.status === 'failed' && s.result)?.stepId ?? null;
}
