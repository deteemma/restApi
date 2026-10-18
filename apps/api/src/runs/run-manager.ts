import {
  ErrorCode,
  type RequestStepResult,
  type RunEvent,
  type RunInput,
  type RunStats,
  type RunSummaryDto,
  type SendDto,
  type SendInput,
} from '@restapi/shared';
import { VariableScope, executeRequestStep, runScenario, type RunResult } from '../engine';
import { DomainError } from '../errors';
import type { Store } from '../store/store';
import { createSanitizer, type Sanitizer } from './sanitize';

export interface RunManagerOptions {
  /** Plafond d'Exécutions simultanées sur le serveur. */
  maxConcurrentRuns: number;
  /** Durée de conservation d'une Exécution non épinglée. */
  retentionDays: number;
  now?: () => Date;
}

type Listener = (event: RunEvent) => void;

interface ActiveRun {
  owner: string;
  controller: AbortController;
  /** Événements déjà émis, rejoués à chaque nouvel abonné. */
  events: RunEvent[];
  listeners: Set<Listener>;
  done: Promise<void>;
}

const DAY_MS = 24 * 3600 * 1000;

/**
 * Lance les Exécutions en arrière-plan, les enregistre au fil de l'eau et diffuse leurs
 * événements. Tout ce qui sort d'ici (stockage, flux) a ses valeurs secrètes masquées.
 */
export class RunManager {
  private readonly active = new Map<string, ActiveRun>();
  private readonly now: () => Date;

  constructor(
    private readonly store: Store,
    private readonly options: RunManagerOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  get retentionMs(): number {
    return this.options.retentionDays * DAY_MS;
  }

  /** Fige l'Instantané, enregistre l'Exécution et la lance sans attendre sa fin. */
  async start(owner: string, scenarioId: string, input: RunInput): Promise<RunSummaryDto> {
    if (this.active.size >= this.options.maxConcurrentRuns) {
      throw new DomainError(429, ErrorCode.TooManyRuns);
    }
    const prepared = await this.store.execution.scenarioSnapshot(
      owner,
      scenarioId,
      input.environmentId,
      input.parameters ?? {},
    );
    const blocking = prepared.issues.filter((i) => i.severity === 'error');
    if (blocking.length > 0) throw new DomainError(422, ErrorCode.ScenarioInvalid, blocking);

    const sanitize = createSanitizer(prepared.secrets);
    const startedAt = this.now();
    const run = await this.store.runs.create(owner, {
      collectionId: prepared.collectionId,
      scenarioId,
      scenarioName: prepared.snapshot.scenario.name,
      environmentName: prepared.snapshot.environment?.name ?? null,
      snapshot: sanitize.value(prepared.snapshot),
      startedAt,
      expiresAt: new Date(startedAt.getTime() + this.retentionMs),
    });

    const handle: ActiveRun = {
      owner,
      controller: new AbortController(),
      events: [],
      listeners: new Set(),
      done: Promise.resolve(),
    };
    this.active.set(run.id, handle);
    handle.done = this.execute(run.id, handle, prepared.snapshot, sanitize);
    return run;
  }

  /** Arrêt manuel. Sans effet sur une Exécution déjà terminée. */
  async stop(owner: string, runId: string): Promise<void> {
    const handle = this.active.get(runId);
    if (handle && handle.owner === owner) {
      handle.controller.abort();
      return;
    }
    await this.store.runs.summary(owner, runId); // 404 si elle n'existe pas
  }

  /**
   * Abonnement au flux d'une Exécution en cours : renvoie les événements déjà émis, puis appelle
   * `listener` pour chaque nouvel événement. Renvoie null si l'Exécution n'est pas (ou plus) en cours.
   */
  subscribe(
    owner: string,
    runId: string,
    listener: Listener,
  ): { replay: RunEvent[]; unsubscribe: () => void } | null {
    const handle = this.active.get(runId);
    if (!handle || handle.owner !== owner) return null;
    handle.listeners.add(listener);
    return { replay: [...handle.events], unsubscribe: () => handle.listeners.delete(listener) };
  }

  /** Attend la fin de toutes les Exécutions en cours (arrêt du serveur, tests). */
  async idle(): Promise<void> {
    await Promise.all([...this.active.values()].map((h) => h.done));
  }

  /** Envoi d'une Requête seule (version enregistrée ou brouillon de l'éditeur). */
  async send(owner: string, requestId: string, input: SendInput): Promise<SendDto> {
    const ctx = await this.store.execution.requestContext(owner, requestId, input.environmentId);
    const request = input.draft ? { ...withoutFolder(input.draft), id: requestId } : ctx.request;
    const outcome = await executeRequestStep({
      step: { id: 'send', type: 'request', requestId, extractions: [] },
      request,
      collection: ctx.collection,
      scope: VariableScope.root({
        collection: ctx.collection.variables,
        environment: ctx.environment?.variables ?? {},
        parameters: {},
      }),
    });
    return this.store.sends.add(owner, {
      requestId,
      collectionId: ctx.collectionId,
      at: this.now(),
      environmentName: ctx.environment?.name ?? null,
      status: outcome.status,
      result: createSanitizer(ctx.secrets).result(outcome.result),
    });
  }

  private async execute(
    runId: string,
    handle: ActiveRun,
    snapshot: Parameters<typeof runScenario>[0],
    sanitize: Sanitizer,
  ): Promise<void> {
    // Écritures en série, dans l'ordre des événements.
    let writes = Promise.resolve();
    const persist = (write: () => Promise<void>) => {
      writes = writes.then(write).catch((error) => console.error(`Exécution ${runId}`, error));
    };
    const broadcast = (event: RunEvent) => {
      handle.events.push(event);
      for (const listener of handle.listeners) listener(event);
    };
    const startedAt = new Map<string, Date>();
    const at = () => this.now();

    let result: RunResult | null = null;
    try {
      result = await runScenario(snapshot, {
        signal: handle.controller.signal,
        now: at,
        onEvent: (raw) => {
          if (raw.type === 'run.finished') return; // diffusé une fois tout enregistré
          if (raw.type === 'step.started') startedAt.set(raw.stepId, new Date(raw.at));
          const event =
            raw.type === 'step.finished' && raw.result
              ? { ...raw, result: sanitize.result(raw.result) }
              : raw;
          if (event.type === 'step.finished') {
            persist(() =>
              this.store.runs.appendStep(runId, {
                stepId: event.stepId,
                status: event.status,
                startedAt: startedAt.get(event.stepId) ?? null,
                finishedAt: new Date(event.at),
                ...(event.result ? { result: event.result } : {}),
              }),
            );
          }
          broadcast(event);
        },
      });
    } catch (error) {
      console.error(`Exécution ${runId} : erreur inattendue du moteur`, error);
    }

    const status = result?.status ?? 'failed';
    const finishedAt = at();
    persist(() =>
      this.store.runs.finish(runId, {
        status,
        finishedAt,
        stats: computeStats(snapshot, result),
        variables: sanitize.value(result?.variables ?? {}),
      }),
    );
    await writes;
    broadcast({ type: 'run.finished', status, at: finishedAt.toISOString() });
    this.active.delete(runId);
  }
}

function computeStats(
  snapshot: Parameters<typeof runScenario>[0],
  result: RunResult | null,
): RunStats {
  const stats: RunStats = {
    requests: { succeeded: 0, failed: 0, skipped: 0, stopped: 0 },
    assertions: { passed: 0, failed: 0 },
  };
  if (!result) return stats;
  const requestStepIds = new Set<string>();
  const visit = (step: (typeof snapshot.scenario.root.steps)[number]) => {
    if (step.type === 'request') requestStepIds.add(step.id);
    if (step.type === 'group') step.steps.forEach(visit);
  };
  visit(snapshot.scenario.root);
  for (const [stepId, { status, result: stepResult }] of Object.entries(result.steps)) {
    if (!requestStepIds.has(stepId)) continue;
    stats.requests[status]++;
    for (const a of (stepResult as RequestStepResult | undefined)?.assertions ?? []) {
      stats.assertions[a.passed ? 'passed' : 'failed']++;
    }
  }
  return stats;
}

function withoutFolder<T extends { folderId?: unknown }>(draft: T): Omit<T, 'folderId'> {
  const { folderId: _folderId, ...rest } = draft;
  return rest;
}
