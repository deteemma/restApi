import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  ErrorCode,
  type GroupStep,
  type RunInput,
  type ScenarioInput,
  type ScenarioIssue,
  type Step,
} from '@restapi/shared';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../core/api-client';
import { apiErrorCode, apiErrorDetails } from '../core/api-error';
import { Notifier } from '../core/notifier';
import { WorkspaceStore } from '../core/workspace.store';
import { LaunchDialog, type LaunchDialogData } from './editor/launch-dialog';
import { ScenarioTreeView } from './editor/scenario-tree-view';
import { StatusIcon } from './editor/status-icon';
import { StepProperties } from './editor/step-properties';
import { StepResult } from './editor/step-result';
import { RunTracker } from './run-tracker';
import { findStep, updateStep } from './scenario-tree';
import { type PendingChanges, warnBeforeUnload } from '../shared/unsaved/unsaved-changes.guard';

/** Délai avant de recalculer les Anomalies du brouillon, après la dernière modification. */
const ISSUES_DEBOUNCE_MS = 400;

/**
 * Éditeur de Scénario : arbre à gauche, propriétés (ou résultat pendant une Exécution) à droite.
 * Lancer enregistre d'abord le brouillon, puis suit l'Exécution en direct.
 */
@Component({
  selector: 'app-scenario-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    RouterLink,
    TranslocoPipe,
    ScenarioTreeView,
    StatusIcon,
    StepProperties,
    StepResult,
  ],
  providers: [RunTracker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scenario-page.html',
  styleUrl: './scenario-page.scss',
  host: { '(keydown.control.s)': 'save($event)', '(keydown.meta.s)': 'save($event)' },
})
export class ScenarioPage implements PendingChanges {
  /** Paramètres de route. */
  readonly scenarioId = input.required<string>();
  readonly collectionId = input.required<string>();

  private readonly api = inject(ApiClient);
  protected readonly store = inject(WorkspaceStore);
  private readonly notifier = inject(Notifier);
  private readonly dialog = inject(MatDialog);
  protected readonly tracker = inject(RunTracker);

  protected readonly scenario = resource({
    params: () => ({ id: this.scenarioId() }),
    loader: ({ params }) => this.api.getScenario(params.id),
  });

  protected readonly draft = signal<ScenarioInput | null>(null);
  private readonly saved = signal<string>('');
  protected readonly dirty = computed(() => {
    const draft = this.draft();
    return !!draft && JSON.stringify(draft) !== this.saved();
  });

  protected readonly issues = signal<ScenarioIssue[]>([]);
  protected readonly issuesByStep = computed(() => {
    const map = new Map<string, ScenarioIssue[]>();
    for (const issue of this.issues())
      map.set(issue.stepId, [...(map.get(issue.stepId) ?? []), issue]);
    return map;
  });
  protected readonly errorCount = computed(
    () => this.issues().filter((i) => i.severity === 'error').length,
  );
  protected readonly warningCount = computed(() => this.issues().length - this.errorCount());

  protected readonly requests = computed(() => this.store.tree()?.requests ?? []);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly selectedStep = computed(() => {
    const draft = this.draft();
    const id = this.selectedId();
    return draft && id ? findStep(draft.root, id) : null;
  });
  protected readonly selectedRequest = computed(() => {
    const step = this.selectedStep();
    return step?.type === 'request'
      ? this.requests().find((r) => r.id === step.requestId)
      : undefined;
  });

  protected readonly runState = this.tracker.state;
  protected readonly selectedRun = computed(() => {
    const id = this.selectedId();
    return id ? (this.runState()?.steps[id] ?? null) : null;
  });

  constructor() {
    warnBeforeUnload(this);
    effect(() => {
      const scenario = this.scenario.value();
      if (!scenario) return;
      untracked(() => {
        const draft = { name: scenario.name, root: scenario.root };
        this.draft.set(draft);
        this.saved.set(JSON.stringify(draft));
        this.selectedId.set(scenario.root.id);
        this.tracker.clear();
      });
    });
    effect(() => {
      const error = this.scenario.error();
      if (error) this.notifier.error(error);
    });

    // Anomalies recalculées par le serveur, peu après chaque modification du brouillon.
    let timer: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      const draft = this.draft();
      const collectionId = this.collectionId();
      clearTimeout(timer);
      if (!draft) return;
      timer = setTimeout(() => {
        this.api
          .getDraftIssues(collectionId, draft)
          .then((issues) => this.issues.set(issues))
          .catch(() => {
            // Brouillon momentanément invalide (par exemple une durée vide) : on garde les Anomalies affichées.
          });
      }, ISSUES_DEBOUNCE_MS);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }

  hasUnsavedChanges(): boolean {
    return this.dirty();
  }

  protected setRoot(root: GroupStep): void {
    this.draft.update((d) => (d ? { ...d, root } : d));
  }

  protected setStep(step: Step): void {
    this.draft.update((d) =>
      d ? { ...d, root: updateStep(d.root, step.id, () => step) as GroupStep } : d,
    );
  }

  protected revert(): void {
    this.draft.set(JSON.parse(this.saved()) as ScenarioInput);
  }

  protected async save(event?: Event): Promise<boolean> {
    event?.preventDefault();
    const draft = this.draft();
    if (!draft) return false;
    if (!this.dirty()) return true;
    try {
      await this.api.updateScenario(this.scenarioId(), draft);
      // Comparaison avec le brouillon envoyé : la réponse du serveur peut ordonner autrement ses clés.
      this.saved.set(JSON.stringify(draft));
      this.notifier.success('scenarioEditor.saved');
      return true;
    } catch (e) {
      this.notifier.error(e);
      return false;
    }
  }

  /** Enregistre si besoin, demande l'Environnement et les Paramètres, puis lance et suit l'Exécution. */
  protected async launch(): Promise<void> {
    const draft = this.draft();
    if (!draft || !(await this.save())) return;
    const data: LaunchDialogData = {
      scenarioName: draft.name,
      environments: this.store.tree()?.environments ?? [],
      environmentId: this.store.environmentId(),
    };
    const input = await firstValueFrom(
      this.dialog
        .open<LaunchDialog, LaunchDialogData, RunInput>(LaunchDialog, { data })
        .afterClosed(),
    );
    if (!input) return;
    try {
      await this.tracker.start(this.scenarioId(), draft.root, input);
    } catch (error) {
      if (apiErrorCode(error) === ErrorCode.ScenarioInvalid) {
        this.issues.set(apiErrorDetails<ScenarioIssue[]>(error) ?? this.issues());
      }
      this.notifier.error(error);
    }
  }

  protected async stop(): Promise<void> {
    try {
      await this.tracker.stop();
    } catch (e) {
      this.notifier.error(e);
    }
  }
}
