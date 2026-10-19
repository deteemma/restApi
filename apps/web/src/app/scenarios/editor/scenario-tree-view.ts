import {
  CdkDrag,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDropList,
  type CdkDragDrop,
} from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import type { GroupMode, GroupStep, ScenarioIssue, Step } from '@restapi/shared';
import type { RequestSummary } from '../../collections/request-tree';
import { MethodBadge } from '../../shared/ui/method-badge';
import type { RunState } from '../run-state';
import { ScenarioDnd, dropListId, type ScenarioDragData } from '../scenario-dnd';
import {
  duplicateStep,
  groupIds,
  groupStep,
  insertStep,
  moveStep,
  pauseStep,
  removeStep,
  requestStep,
} from '../scenario-tree';
import { StatusIcon } from './status-icon';

/** Arbre éditable d'un Scénario : glisser-déposer, menus d'ajout, statuts d'Exécution et Anomalies. */
@Component({
  selector: 'app-scenario-tree-view',
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    CdkDropList,
    NgTemplateOutlet,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    TranslocoPipe,
    MethodBadge,
    StatusIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './scenario-tree-view.html',
  styleUrl: './scenario-tree-view.scss',
})
export class ScenarioTreeView {
  readonly root = input.required<GroupStep>();
  readonly requests = input.required<readonly RequestSummary[]>();
  readonly issues = input<ReadonlyMap<string, readonly ScenarioIssue[]>>(new Map());
  readonly runState = input<RunState | null>(null);
  readonly selectedId = input<string | null>(null);
  /** Pendant une Exécution, l'arbre n'est plus modifiable. */
  readonly readOnly = input(false);
  readonly rootChange = output<GroupStep>();
  readonly stepSelect = output<string>();

  private readonly dnd = inject(ScenarioDnd);
  protected readonly dropListId = dropListId;
  protected readonly listIds = computed(() => groupIds(this.root()).map(dropListId));
  private readonly requestsById = computed(() => new Map(this.requests().map((r) => [r.id, r])));
  protected readonly sortedRequests = computed(() =>
    [...this.requests()].sort((a, b) => a.name.localeCompare(b.name)),
  );

  constructor() {
    // Les Requêtes du panneau gauche peuvent être déposées dans les Groupes de ce Scénario.
    effect(() => this.dnd.dropListIds.set(this.readOnly() ? [] : this.listIds()));
    inject(DestroyRef).onDestroy(() => this.dnd.dropListIds.set([]));
  }

  protected request(id: string): RequestSummary | undefined {
    return this.requestsById().get(id);
  }

  protected status(stepId: string) {
    return this.runState()?.steps[stepId]?.status ?? null;
  }

  protected issuesOf(stepId: string): readonly ScenarioIssue[] {
    return this.issues().get(stepId) ?? [];
  }

  protected worstSeverity(stepId: string): 'error' | 'warning' | null {
    const issues = this.issuesOf(stepId);
    if (issues.some((i) => i.severity === 'error')) return 'error';
    return issues.length ? 'warning' : null;
  }

  protected drop(event: CdkDragDrop<string, unknown, ScenarioDragData>): void {
    const groupId = event.container.data;
    const data = event.item.data;
    if (data.kind === 'request') {
      const step = requestStep(data.request.id);
      this.rootChange.emit(insertStep(this.root(), groupId, event.currentIndex, step));
      this.stepSelect.emit(step.id);
    } else {
      this.rootChange.emit(moveStep(this.root(), data.stepId, groupId, event.currentIndex));
    }
  }

  protected addRequest(groupId: string, requestId: string): void {
    this.append(groupId, requestStep(requestId));
  }

  protected addGroup(groupId: string, mode: GroupMode): void {
    this.append(groupId, groupStep(mode));
  }

  protected addPause(groupId: string): void {
    this.append(groupId, pauseStep());
  }

  protected duplicate(stepId: string): void {
    this.rootChange.emit(duplicateStep(this.root(), stepId));
  }

  protected remove(stepId: string): void {
    this.rootChange.emit(removeStep(this.root(), stepId));
    if (this.selectedId() === stepId) this.stepSelect.emit(this.root().id);
  }

  /** Ajoute en fin de Groupe (insertStep borne la position). */
  private append(groupId: string, step: Step): void {
    this.rootChange.emit(insertStep(this.root(), groupId, Number.MAX_SAFE_INTEGER, step));
    this.stepSelect.emit(step.id);
  }
}
