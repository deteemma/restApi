import {
  ScenarioIssueCode,
  type GroupStep,
  type RequestDefinition,
  type RequestStep,
  type Scenario,
  type ScenarioIssue,
  type Step,
} from '@restapi/shared';
import { PLACEHOLDER } from './variables';

export interface ValidationContext {
  requests: Record<string, RequestDefinition>;
  /** Variables définies hors Exécution : celles de la Collection et de ses Environnements. */
  definedVariables: Iterable<string>;
}

/**
 * Anomalies d'un Scénario, à la conception.
 * Erreurs : le Scénario ne peut pas être lancé. Avertissements : il peut l'être, mais risque d'échouer.
 */
export function validateScenario(scenario: Scenario, context: ValidationContext): ScenarioIssue[] {
  const issues: ScenarioIssue[] = [];
  const error = (stepId: string, code: ScenarioIssueCode, detail?: string) =>
    issues.push({ stepId, severity: 'error', code, ...(detail === undefined ? {} : { detail }) });
  const warning = (stepId: string, code: ScenarioIssueCode, detail?: string) =>
    issues.push({ stepId, severity: 'warning', code, ...(detail === undefined ? {} : { detail }) });

  // Identifiants uniques : le moteur et l'historique s'appuient dessus.
  const seen = new Set<string>();
  for (const step of allSteps(scenario.root)) {
    if (seen.has(step.id)) error(step.id, ScenarioIssueCode.DuplicateStepId);
    seen.add(step.id);
  }

  const defined = new Set(context.definedVariables);

  /**
   * Parcourt l'arbre dans l'ordre d'exécution. `available` contient les Variables d'exécution
   * visibles au démarrage de l'Étape ; on renvoie celles qui le sont à sa fin.
   */
  const visit = (step: Step, available: ReadonlySet<string>): Set<string> => {
    switch (step.type) {
      case 'pause':
        if (!Number.isFinite(step.durationMs) || step.durationMs < 0) {
          error(step.id, ScenarioIssueCode.InvalidPause);
        }
        return new Set(available);

      case 'request': {
        const request = context.requests[step.requestId];
        if (!request) {
          error(step.id, ScenarioIssueCode.OrphanStep, step.requestId);
        } else {
          const local = new Set(Object.keys(step.overrides?.variables ?? {}));
          for (const name of referencedVariables(request, step)) {
            if (!defined.has(name) && !available.has(name) && !local.has(name)) {
              warning(step.id, ScenarioIssueCode.UndefinedVariable, name);
            }
          }
        }
        return new Set([...available, ...step.extractions.map((x) => x.variable)]);
      }

      case 'group': {
        if (step.steps.length === 0) warning(step.id, ScenarioIssueCode.EmptyGroup);
        if (step.mode === 'sequential') {
          return step.steps.reduce((vars, child) => visit(child, vars), new Set(available));
        }
        const max = step.maxConcurrency;
        if (max !== undefined && (!Number.isInteger(max) || max < 1)) {
          error(step.id, ScenarioIssueCode.InvalidConcurrency);
        }
        checkParallelConflicts(step, error);
        // Chaque branche ne voit que ce qui existait au démarrage du Groupe ; tout devient visible à la fin.
        const after = new Set(available);
        for (const child of step.steps) for (const name of visit(child, available)) after.add(name);
        return after;
      }
    }
  };
  visit(scenario.root, new Set());
  return issues;
}

function checkParallelConflicts(
  group: GroupStep,
  error: (stepId: string, code: ScenarioIssueCode, detail?: string) => void,
) {
  // Pour chaque nom de Variable : les Étapes qui l'extraient, regroupées par branche.
  const byVariable = new Map<string, Map<number, string[]>>();
  group.steps.forEach((branch, index) => {
    for (const step of allSteps(branch)) {
      if (step.type !== 'request') continue;
      for (const { variable } of step.extractions) {
        const branches = byVariable.get(variable) ?? new Map<number, string[]>();
        branches.set(index, [...(branches.get(index) ?? []), step.id]);
        byVariable.set(variable, branches);
      }
    }
  });
  for (const [variable, branches] of byVariable) {
    if (branches.size < 2) continue;
    for (const stepIds of branches.values()) {
      for (const stepId of stepIds) {
        error(stepId, ScenarioIssueCode.ConflictingParallelExtraction, variable);
      }
    }
  }
}

function* allSteps(step: Step): Generator<Step> {
  yield step;
  if (step.type === 'group') for (const child of step.steps) yield* allSteps(child);
}

/** Noms des Variables utilisées par une Étape-requête, Surcharges comprises. */
function referencedVariables(request: RequestDefinition, step: RequestStep): Set<string> {
  const texts: string[] = [request.url];
  const pairs = [...request.query, ...request.headers, ...(step.overrides?.headers ?? [])];
  for (const p of pairs) if (p.enabled !== false) texts.push(p.name, p.value);

  const body = step.overrides?.body ?? request.body;
  if (body.type === 'form') {
    for (const f of body.fields) if (f.enabled !== false) texts.push(f.name, f.value);
  } else if (body.type !== 'none') {
    texts.push(body.content);
  }

  const auth = request.auth;
  if (auth.type === 'basic') texts.push(auth.username, auth.password);
  if (auth.type === 'bearer') texts.push(auth.token);
  if (auth.type === 'apiKey') texts.push(auth.name, auth.value);

  for (const a of request.assertions) if (a.expected) texts.push(a.expected);
  texts.push(...Object.values(step.overrides?.variables ?? {}));

  const names = new Set<string>();
  for (const text of texts) for (const m of text.matchAll(PLACEHOLDER)) names.add(m[1]!);
  return names;
}
