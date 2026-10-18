/**
 * Objets échangés avec l'API d'exécution (L3) : Exécutions et Envois.
 */
import type { RequestInput } from './api';
import type { RequestStepResult, RunEvent, RunSnapshot, RunStatus, StepStatus } from './model';

export type FinalStepStatus = Exclude<StepStatus, 'pending' | 'running'>;

export interface RunInput {
  /** Environnement de la Collection ; absent ou null : aucun. */
  environmentId?: string | null;
  parameters?: Record<string, string>;
}

export interface RunStats {
  /** Étapes-requêtes, par statut final. */
  requests: Record<FinalStepStatus, number>;
  assertions: { passed: number; failed: number };
}

export interface RunSummaryDto {
  id: string;
  collectionId: string;
  scenarioId: string;
  scenarioName: string;
  environmentName: string | null;
  status: RunStatus;
  pinned: boolean;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  /** Null tant que l'Exécution est en cours. */
  stats: RunStats | null;
}

export interface RunStepDto {
  stepId: string;
  status: FinalStepStatus;
  startedAt: string | null;
  finishedAt: string;
  result?: RequestStepResult;
}

export interface RunDto extends RunSummaryDto {
  /** Instantané, avec les valeurs secrètes masquées. */
  snapshot: RunSnapshot;
  steps: RunStepDto[];
  /** Variables d'exécution finales (valeurs secrètes masquées). */
  variables: Record<string, string>;
}

export interface RunPatch {
  pinned: boolean;
}

/** Un message du flux SSE `GET /api/runs/:id/events`. */
export type RunStreamMessage = RunEvent;

export interface SendInput {
  environmentId?: string | null;
  /** Version non enregistrée de la Requête (éditeur) ; à défaut, la version enregistrée. */
  draft?: RequestInput;
}

export interface SendDto {
  id: string;
  requestId: string;
  at: string;
  environmentName: string | null;
  status: 'succeeded' | 'failed';
  result: RequestStepResult;
}

/** Remplace les valeurs secrètes dans tout ce qui est stocké ou diffusé. */
export const SECRET_MASK = '••••••';
