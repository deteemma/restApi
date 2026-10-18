/**
 * Modèle du domaine partagé par l'API et l'interface.
 * Vocabulaire : voir GLOSSARY.md à la racine du dépôt.
 */

// ---------------------------------------------------------------------------
// Préparation
// ---------------------------------------------------------------------------

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** Une paire nom/valeur : en-tête, paramètre de requête ou champ de formulaire. */
export interface KeyValue {
  name: string;
  value: string;
  /** Absent ou vrai : la paire est envoyée. */
  enabled?: boolean;
}

export type RequestBody =
  | { type: 'none' }
  | { type: 'json'; content: string }
  | { type: 'text'; content: string }
  | { type: 'xml'; content: string }
  | { type: 'form'; fields: KeyValue[] };

/** Authentification qui peut être portée directement par une Collection. */
export type CollectionAuth =
  | { type: 'none' }
  | { type: 'basic'; username: string; password: string }
  | { type: 'bearer'; token: string }
  | { type: 'apiKey'; name: string; value: string; in: 'header' | 'query' };

/** Une Requête peut en plus hériter de l'authentification de sa Collection. */
export type RequestAuth = { type: 'inherit' } | CollectionAuth;

export interface HttpSettings {
  timeoutMs: number;
  followRedirects: boolean;
  ignoreTlsErrors: boolean;
}

export const DEFAULT_HTTP_SETTINGS: HttpSettings = {
  timeoutMs: 30_000,
  followRedirects: true,
  ignoreTlsErrors: false,
};

/** Ce qu'une Assertion examine dans la réponse. */
export type AssertionTarget =
  | { type: 'status' }
  | { type: 'header'; name: string }
  | { type: 'jsonPath'; path: string }
  | { type: 'duration' };

export const ASSERTION_OPERATORS = [
  'equals',
  'notEquals',
  'contains',
  'exists',
  'notExists',
  'matches',
  'lt',
  'lte',
  'gt',
  'gte',
  'isType',
] as const;
export type AssertionOperator = (typeof ASSERTION_OPERATORS)[number];

/** Opérateurs qui n'attendent pas de valeur de comparaison. */
export const UNARY_ASSERTION_OPERATORS: readonly AssertionOperator[] = ['exists', 'notExists'];

export const VALUE_TYPES = ['string', 'number', 'boolean', 'null', 'array', 'object'] as const;
export type ValueType = (typeof VALUE_TYPES)[number];

export interface Assertion {
  target: AssertionTarget;
  operator: AssertionOperator;
  /** Valeur attendue, qui peut contenir des {{Variables}}. Absente pour exists / notExists. */
  expected?: string;
}

export interface RequestDefinition {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  query: KeyValue[];
  headers: KeyValue[];
  body: RequestBody;
  auth: RequestAuth;
  assertions: Assertion[];
  /** Réglages propres à la Requête ; les autres viennent de la Collection. */
  settings?: Partial<HttpSettings>;
}

// ---------------------------------------------------------------------------
// Scénarios
// ---------------------------------------------------------------------------

export type ExtractionSource =
  { type: 'status' } | { type: 'header'; name: string } | { type: 'jsonPath'; path: string };

export interface Extraction {
  /** Nom de la Variable d'exécution créée. */
  variable: string;
  source: ExtractionSource;
}

/** Surcharges d'une Étape-requête : elles ne valent que pour cette Étape. */
export interface StepOverrides {
  variables?: Record<string, string>;
  /** Remplace (par nom, sans tenir compte de la casse) ou ajoute des en-têtes. */
  headers?: KeyValue[];
  body?: RequestBody;
}

export interface RequestStep {
  id: string;
  type: 'request';
  requestId: string;
  overrides?: StepOverrides;
  extractions: Extraction[];
}

export type GroupMode = 'sequential' | 'parallel';

export const DEFAULT_MAX_CONCURRENCY = 10;

export interface GroupStep {
  id: string;
  type: 'group';
  name?: string;
  mode: GroupMode;
  /** Groupe parallèle uniquement. Par défaut : DEFAULT_MAX_CONCURRENCY. */
  maxConcurrency?: number;
  /** Arrêt au premier échec. Par défaut : vrai. */
  stopOnFailure?: boolean;
  steps: Step[];
}

export interface PauseStep {
  id: string;
  type: 'pause';
  durationMs: number;
}

export type Step = RequestStep | GroupStep | PauseStep;

export interface Scenario {
  id: string;
  name: string;
  /** La racine est toujours un Groupe. */
  root: GroupStep;
}

// ---------------------------------------------------------------------------
// Exécution
// ---------------------------------------------------------------------------

export type StepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'stopped';
export type RunStatus = 'running' | 'succeeded' | 'failed' | 'stopped';

/** Raisons techniques de l'échec d'une Étape-requête. L'interface les traduit. */
export const StepErrorCode = {
  UnknownVariable: 'UNKNOWN_VARIABLE',
  CircularVariable: 'CIRCULAR_VARIABLE',
  RequestNotFound: 'REQUEST_NOT_FOUND',
  InvalidUrl: 'INVALID_URL',
  Timeout: 'TIMEOUT',
  Network: 'NETWORK',
  UnexpectedStatus: 'UNEXPECTED_STATUS',
  AssertionFailed: 'ASSERTION_FAILED',
  ExtractionFailed: 'EXTRACTION_FAILED',
} as const;
export type StepErrorCode = (typeof StepErrorCode)[keyof typeof StepErrorCode];

export interface StepError {
  code: StepErrorCode;
  /** Détail technique, en anglais, non traduit (message réseau, noms de Variables…). */
  detail?: string;
}

/** La requête réellement envoyée, après résolution des Variables. */
export interface SentRequest {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface ReceivedResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
}

export interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  /** Valeur effectivement trouvée dans la réponse (absente si rien n'a été trouvé). */
  actual?: unknown;
  /** Valeur attendue après résolution des Variables. */
  expected?: string;
}

export interface ExtractionResult {
  extraction: Extraction;
  value?: string;
}

export interface RequestStepResult {
  request?: SentRequest;
  response?: ReceivedResponse;
  error?: StepError;
  assertions: AssertionResult[];
  extractions: ExtractionResult[];
}

export type RunEvent =
  | { type: 'run.started'; at: string }
  | { type: 'step.started'; stepId: string; at: string }
  | {
      type: 'step.finished';
      stepId: string;
      status: Exclude<StepStatus, 'pending' | 'running'>;
      at: string;
      /** Présent pour une Étape-requête qui a été lancée. */
      result?: RequestStepResult;
    }
  | { type: 'run.finished'; status: Exclude<RunStatus, 'running'>; at: string };

/** Ce qu'une Collection apporte à l'exécution de ses Requêtes. */
export interface CollectionContext {
  variables: Record<string, string>;
  auth: CollectionAuth;
  settings: HttpSettings;
}

/**
 * Instantané figé au lancement d'une Exécution (ADR 0004) : le Scénario, les Requêtes qu'il
 * référence, la Collection, l'Environnement choisi et les Paramètres de lancement.
 */
export interface RunSnapshot {
  scenario: Scenario;
  requests: Record<string, RequestDefinition>;
  collection: CollectionContext;
  environment: { name: string; variables: Record<string, string> } | null;
  parameters: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Validation d'un Scénario
// ---------------------------------------------------------------------------

export const ScenarioIssueCode = {
  /** Deux branches d'un même Groupe parallèle extraient une Variable du même nom. */
  ConflictingParallelExtraction: 'CONFLICTING_PARALLEL_EXTRACTION',
  OrphanStep: 'ORPHAN_STEP',
  DuplicateStepId: 'DUPLICATE_STEP_ID',
  InvalidPause: 'INVALID_PAUSE',
  InvalidConcurrency: 'INVALID_CONCURRENCY',
  /** Avertissement : Variable définie nulle part (elle pourra venir d'un Paramètre de lancement). */
  UndefinedVariable: 'UNDEFINED_VARIABLE',
  /** Avertissement. */
  EmptyGroup: 'EMPTY_GROUP',
} as const;
export type ScenarioIssueCode = (typeof ScenarioIssueCode)[keyof typeof ScenarioIssueCode];

export interface ScenarioIssue {
  stepId: string;
  severity: 'error' | 'warning';
  code: ScenarioIssueCode;
  /** Nom de Variable, identifiant de Requête… */
  detail?: string;
}
