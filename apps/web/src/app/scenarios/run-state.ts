import type {
  GroupStep,
  RequestStepResult,
  RunEvent,
  RunStatus,
  StepStatus,
} from '@restapi/shared';
import { allSteps } from './scenario-tree';

/** État d'une Exécution suivie en direct, reconstruit à partir de ses événements. */
export interface RunState {
  status: RunStatus;
  steps: Record<string, { status: StepStatus; result?: RequestStepResult }>;
}

/** Au lancement : l'Exécution est en cours et toutes les Étapes sont en attente. */
export function initialRunState(root: GroupStep): RunState {
  return {
    status: 'running',
    steps: Object.fromEntries(
      allSteps(root).map((s) => [s.id, { status: 'pending' as StepStatus }]),
    ),
  };
}

export function applyRunEvent(state: RunState, event: RunEvent): RunState {
  switch (event.type) {
    case 'run.started':
      return state;
    case 'step.started':
      return { ...state, steps: { ...state.steps, [event.stepId]: { status: 'running' } } };
    case 'step.finished':
      return {
        ...state,
        steps: {
          ...state.steps,
          [event.stepId]: event.result
            ? { status: event.status, result: event.result }
            : { status: event.status },
        },
      };
    case 'run.finished':
      return { ...state, status: event.status };
  }
}

/** Compteurs d'avancement : Étapes terminées sur le total. */
export function progress(state: RunState): { done: number; total: number } {
  const all = Object.values(state.steps);
  return {
    done: all.filter((s) => s.status !== 'pending' && s.status !== 'running').length,
    total: all.length,
  };
}
