import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { RunStatus, RunSummaryDto } from '@restapi/shared';
import { ApiClient } from '../core/api-client';
import { Notifier } from '../core/notifier';
import { WorkspaceStore } from '../core/workspace.store';
import { StatusIcon } from '../scenarios/editor/status-icon';
import { AppDatePipe } from '../shared/ui/app-date.pipe';
import { AppDurationPipe } from '../shared/ui/app-duration.pipe';

/** Nombre d'Exécutions chargées à la fois. */
export const HISTORY_PAGE_SIZE = 50;

/** Historique des Exécutions d'un Scénario (ou de toute la Collection), le plus récent en premier. */
@Component({
  selector: 'app-run-history-page',
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatSelectModule,
    MatTooltipModule,
    RouterLink,
    TranslocoPipe,
    AppDatePipe,
    AppDurationPipe,
    StatusIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './run-history-page.html',
  styleUrl: './run-history-page.scss',
})
export class RunHistoryPage {
  /** Paramètres de route ; sans Scénario, l'historique couvre toute la Collection. */
  readonly collectionId = input.required<string>();
  readonly scenarioId = input<string | undefined>(undefined);

  private readonly api = inject(ApiClient);
  private readonly store = inject(WorkspaceStore);
  private readonly notifier = inject(Notifier);

  protected readonly statuses: RunStatus[] = ['succeeded', 'failed', 'stopped', 'running'];
  protected readonly status = signal<RunStatus | null>(null);
  protected readonly pinnedOnly = signal(false);
  protected readonly runs = signal<RunSummaryDto[]>([]);
  protected readonly loading = signal(false);
  protected readonly hasMore = signal(false);

  protected readonly scenarioName = computed(() => {
    const id = this.scenarioId();
    return id ? (this.store.tree()?.scenarios.find((s) => s.id === id)?.name ?? null) : null;
  });

  constructor() {
    // Recharge depuis le début à chaque changement de Scénario ou de filtre.
    effect(() => {
      const filter = this.filter();
      void this.load(filter, false);
    });
  }

  private readonly filter = computed(() => ({
    collectionId: this.scenarioId() ? undefined : this.collectionId(),
    scenarioId: this.scenarioId(),
    status: this.status() ?? undefined,
    pinned: this.pinnedOnly() ? true : undefined,
    limit: HISTORY_PAGE_SIZE,
  }));

  protected link(run: RunSummaryDto): unknown[] {
    return ['/collections', this.collectionId(), 'runs', run.id];
  }

  protected refresh(): void {
    void this.load(this.filter(), false);
  }

  protected loadMore(): void {
    void this.load(this.filter(), true);
  }

  protected async togglePin(run: RunSummaryDto): Promise<void> {
    try {
      const updated = await this.api.setRunPinned(run.id, !run.pinned);
      this.runs.update((runs) => runs.map((r) => (r.id === updated.id ? updated : r)));
    } catch (e) {
      this.notifier.error(e);
    }
  }

  private async load(filter: ReturnType<typeof this.filter>, append: boolean): Promise<void> {
    this.loading.set(true);
    try {
      const before = append ? this.runs().at(-1)?.startedAt : undefined;
      const page = await this.api.listRuns({ ...filter, before });
      this.runs.set(append ? [...this.runs(), ...page] : page);
      this.hasMore.set(page.length === HISTORY_PAGE_SIZE);
    } catch (e) {
      this.notifier.error(e);
    } finally {
      this.loading.set(false);
    }
  }
}
