import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type { GroupStep, RunEvent, RunInput, RunSummaryDto } from '@restapi/shared';
import { ApiClient } from '../core/api-client';
import { applyRunEvent, initialRunState, progress, type RunState } from './run-state';

/**
 * Lance une Exécution et la suit en direct par le flux SSE `/api/runs/:id/events`.
 * Fourni par la page du Scénario : le flux se ferme quand on la quitte.
 */
@Injectable()
export class RunTracker {
  private readonly api = inject(ApiClient);
  private source: EventSource | null = null;

  readonly run = signal<RunSummaryDto | null>(null);
  readonly state = signal<RunState | null>(null);
  readonly running = computed(() => this.state()?.status === 'running');
  readonly progress = computed(() => {
    const state = this.state();
    return state ? progress(state) : null;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.close());
  }

  async start(scenarioId: string, root: GroupStep, input: RunInput): Promise<RunSummaryDto> {
    const run = await this.api.startRun(scenarioId, input);
    this.follow(run, root);
    return run;
  }

  /** Suit une Exécution : le serveur rejoue d'abord ce qui s'est déjà passé. */
  follow(run: RunSummaryDto, root: GroupStep): void {
    this.close();
    this.run.set(run);
    this.state.set(initialRunState(root));
    const source = new EventSource(`/api/runs/${run.id}/events`);
    source.onmessage = (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as RunEvent;
      this.state.update((state) => (state ? applyRunEvent(state, event) : state));
      // Le serveur ferme le flux après run.finished : on le ferme aussi, sinon le navigateur se reconnecterait.
      if (event.type === 'run.finished') this.close();
    };
    this.source = source;
  }

  async stop(): Promise<void> {
    const run = this.run();
    if (run) await this.api.stopRun(run.id);
  }

  /** Oublie l'Exécution affichée (retour à l'édition). */
  clear(): void {
    this.close();
    this.run.set(null);
    this.state.set(null);
  }

  private close(): void {
    this.source?.close();
    this.source = null;
  }
}
