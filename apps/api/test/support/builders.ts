import {
  DEFAULT_HTTP_SETTINGS,
  type CollectionContext,
  type GroupStep,
  type PauseStep,
  type RequestDefinition,
  type RequestStep,
  type RunSnapshot,
  type Step,
} from '@restapi/shared';

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${++counter}`;

export function req(partial: Partial<RequestDefinition> = {}): RequestDefinition {
  const id = partial.id ?? nextId('req');
  return {
    name: id,
    method: 'GET',
    url: '{{base}}/echo',
    query: [],
    headers: [],
    body: { type: 'none' },
    auth: { type: 'inherit' },
    assertions: [],
    ...partial,
    id,
  };
}

export function reqStep(
  request: RequestDefinition | string,
  partial: Partial<RequestStep> = {},
): RequestStep {
  return {
    type: 'request',
    requestId: typeof request === 'string' ? request : request.id,
    extractions: [],
    ...partial,
    id: partial.id ?? nextId('step'),
  };
}

export function seq(steps: Step[], options: Partial<GroupStep> = {}): GroupStep {
  return { id: nextId('seq'), type: 'group', mode: 'sequential', steps, ...options };
}

export function par(steps: Step[], options: Partial<GroupStep> = {}): GroupStep {
  return { id: nextId('par'), type: 'group', mode: 'parallel', steps, ...options };
}

export function pause(durationMs: number, id = nextId('pause')): PauseStep {
  return { id, type: 'pause', durationMs };
}

export function collection(partial: Partial<CollectionContext> = {}): CollectionContext {
  return {
    variables: {},
    auth: { type: 'none' },
    settings: { ...DEFAULT_HTTP_SETTINGS },
    ...partial,
  };
}

/** Instantané d'un Scénario dont la racine est `root`, avec `base` qui pointe vers l'API cible. */
export function snapshot(
  base: string,
  root: GroupStep,
  requests: RequestDefinition[],
  partial: Partial<RunSnapshot> = {},
): RunSnapshot {
  return {
    scenario: { id: nextId('scn'), name: 'test', root },
    requests: Object.fromEntries(requests.map((r) => [r.id, r])),
    collection: collection({ variables: { base } }),
    environment: null,
    parameters: {},
    ...partial,
  };
}
