import {
  DEFAULT_MAX_CONCURRENCY,
  type GroupStep,
  type PauseStep,
  type RequestStepResult,
  type RunEvent,
  type RunSnapshot,
  type RunStatus,
  type Step,
  type StepStatus,
} from '@restapi/shared';
import { executeRequestStep } from './request-step';
import { VariableScope } from './variables';

export type FinalStepStatus = Exclude<StepStatus, 'pending' | 'running'>;
export type FinalRunStatus = Exclude<RunStatus, 'running'>;

export interface RunOptions {
  /** Arrêt manuel : plus aucune Étape ne démarre, les requêtes déjà parties vont jusqu'au bout. */
  signal?: AbortSignal;
  onEvent?: (event: RunEvent) => void;
  now?: () => Date;
}

export interface RunResult {
  status: FinalRunStatus;
  steps: Record<string, { status: FinalStepStatus; result?: RequestStepResult }>;
  /** Variables d'exécution à la fin de l'Exécution. */
  variables: Record<string, string>;
}

/**
 * Exécute un Scénario à partir de son Instantané.
 *
 * Statuts :
 * - Ignorée : l'Étape n'a jamais démarré (échec avant elle ou arrêt manuel) ;
 * - Arrêtée : l'Étape avait démarré mais a été interrompue par l'arrêt (Pause en cours, Groupe
 *   inachevé). Une requête en vol n'est jamais interrompue : elle garde son vrai résultat.
 */
export async function runScenario(
  snapshot: RunSnapshot,
  options: RunOptions = {},
): Promise<RunResult> {
  const { signal, onEvent = () => {}, now = () => new Date() } = options;
  const at = () => now().toISOString();
  const steps: RunResult['steps'] = {};
  const stopped = () => signal?.aborted === true;

  const finish = (step: Step, status: FinalStepStatus, result?: RequestStepResult) => {
    steps[step.id] = result ? { status, result } : { status };
    onEvent({
      type: 'step.finished',
      stepId: step.id,
      status,
      at: at(),
      ...(result ? { result } : {}),
    });
    return status;
  };

  /** Ignore une Étape et tous ses descendants. */
  const skip = (step: Step): FinalStepStatus => {
    finish(step, 'skipped');
    if (step.type === 'group') step.steps.forEach(skip);
    return 'skipped';
  };

  const runStep = async (step: Step, scope: VariableScope): Promise<FinalStepStatus> => {
    if (stopped()) return skip(step);
    onEvent({ type: 'step.started', stepId: step.id, at: at() });
    switch (step.type) {
      case 'request': {
        const outcome = await executeRequestStep({
          step,
          request: snapshot.requests[step.requestId],
          collection: snapshot.collection,
          scope,
        });
        return finish(step, outcome.status, outcome.result);
      }
      case 'pause':
        return finish(step, (await pauseFor(step, signal)) ? 'succeeded' : 'stopped');
      case 'group':
        return finish(
          step,
          step.mode === 'sequential'
            ? await runSequential(step, scope)
            : await runParallel(step, scope),
        );
    }
  };

  const runSequential = async (group: GroupStep, scope: VariableScope) => {
    const stopOnFailure = group.stopOnFailure ?? true;
    let failed = false;
    let interrupted = false;
    for (const child of group.steps) {
      if (stopped()) interrupted = true;
      if (interrupted || (failed && stopOnFailure)) {
        skip(child);
        continue;
      }
      const status = await runStep(child, scope);
      if (status === 'failed') failed = true;
      if (status === 'stopped') interrupted = true;
    }
    return groupStatus(failed, interrupted);
  };

  const runParallel = async (group: GroupStep, scope: VariableScope) => {
    const stopOnFailure = group.stopOnFailure ?? true;
    const children = group.steps;
    // Chaque branche a sa propre portée : ses Extractions ne sont visibles qu'après la fusion.
    const branches = children.map(() => scope.fork());
    const statuses: (FinalStepStatus | undefined)[] = [];
    let next = 0;
    let failed = false;
    let interrupted = false;

    const worker = async () => {
      while (next < children.length) {
        if (stopped()) interrupted = true;
        if (interrupted || (failed && stopOnFailure)) return;
        const i = next++;
        statuses[i] = await runStep(children[i]!, branches[i]!);
        if (statuses[i] === 'failed') failed = true;
        if (statuses[i] === 'stopped') interrupted = true;
      }
    };
    const concurrency = Math.max(1, group.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY);
    await Promise.all(Array.from({ length: Math.min(concurrency, children.length) }, worker));

    children.forEach((child, i) => {
      if (statuses[i] === undefined) skip(child);
    });
    scope.merge(branches);
    return groupStatus(failed, interrupted);
  };

  onEvent({ type: 'run.started', at: at() });
  const rootScope = VariableScope.root({
    collection: snapshot.collection.variables,
    environment: snapshot.environment?.variables ?? {},
    parameters: snapshot.parameters,
  });
  const rootStatus = await runStep(snapshot.scenario.root, rootScope);
  const status: FinalRunStatus =
    rootStatus === 'succeeded' ? 'succeeded' : rootStatus === 'failed' ? 'failed' : 'stopped';
  onEvent({ type: 'run.finished', status, at: at() });

  return { status, steps, variables: rootScope.runVariables() };
}

function groupStatus(failed: boolean, interrupted: boolean): FinalStepStatus {
  if (interrupted) return 'stopped';
  return failed ? 'failed' : 'succeeded';
}

/** Vrai si la Pause est allée à son terme, faux si l'arrêt manuel l'a interrompue. */
function pauseFor(step: PauseStep, signal: AbortSignal | undefined): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve(true);
    }, step.durationMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
