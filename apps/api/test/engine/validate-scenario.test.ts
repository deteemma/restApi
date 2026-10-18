import { describe, expect, it } from 'vitest';
import { ScenarioIssueCode, type GroupStep, type RequestDefinition } from '@restapi/shared';
import { validateScenario } from '../../src/engine/validate-scenario';
import { par, pause, req, reqStep, seq } from '../support/builders';

const extract = (variable: string) => [
  { variable, source: { type: 'jsonPath' as const, path: '$.id' } },
];

function validate(
  root: GroupStep,
  requests: RequestDefinition[],
  definedVariables: string[] = ['base'],
) {
  return validateScenario(
    { id: 'scn', name: 'test', root },
    { requests: Object.fromEntries(requests.map((r) => [r.id, r])), definedVariables },
  );
}

const codes = (issues: ReturnType<typeof validate>) =>
  issues.map((i) => [i.code, i.stepId, i.detail]);

describe('validateScenario', () => {
  it('ne signale rien pour un Scénario correct', () => {
    const create = req({ url: '{{base}}/items' });
    const read = req({ url: '{{base}}/items/{{id}}' });
    const root = seq([reqStep(create, { extractions: extract('id') }), reqStep(read)]);
    expect(validate(root, [create, read])).toEqual([]);
  });

  it('refuse deux Extractions du même nom dans des branches d’un même Groupe parallèle', () => {
    const a = req();
    const s1 = reqStep(a, { extractions: extract('token') });
    const s2 = reqStep(a, { extractions: extract('token') });
    const s3 = reqStep(a, { extractions: extract('other') });
    const root = seq([par([s1, seq([s2]), s3])]);

    const issues = validate(root, [a]);
    expect(issues.every((i) => i.severity === 'error')).toBe(true);
    expect(codes(issues)).toEqual([
      [ScenarioIssueCode.ConflictingParallelExtraction, s1.id, 'token'],
      [ScenarioIssueCode.ConflictingParallelExtraction, s2.id, 'token'],
    ]);
  });

  it('accepte la même Extraction répétée dans une même branche séquentielle', () => {
    const a = req();
    const root = seq([
      par([
        seq([reqStep(a, { extractions: extract('t') }), reqStep(a, { extractions: extract('t') })]),
      ]),
    ]);
    expect(validate(root, [a])).toEqual([]);
  });

  it('signale les Étapes orphelines', () => {
    const orphan = reqStep('deleted');
    expect(codes(validate(seq([orphan]), []))).toEqual([
      [ScenarioIssueCode.OrphanStep, orphan.id, 'deleted'],
    ]);
  });

  it("signale les identifiants d'Étape en double", () => {
    const a = req();
    const root = seq([reqStep(a, { id: 'same' }), reqStep(a, { id: 'same' })]);
    expect(codes(validate(root, [a]))).toEqual([
      [ScenarioIssueCode.DuplicateStepId, 'same', undefined],
    ]);
  });

  it('signale une Pause ou une concurrence invalide', () => {
    const p = pause(-5);
    const g = par([p], { maxConcurrency: 0 });
    expect(codes(validate(seq([g]), []))).toEqual([
      [ScenarioIssueCode.InvalidConcurrency, g.id, undefined],
      [ScenarioIssueCode.InvalidPause, p.id, undefined],
    ]);
  });

  describe('Variables non définies (avertissements)', () => {
    it("signale une Variable utilisée n'importe où dans la Requête et définie nulle part", () => {
      const a = req({
        url: '{{base}}/{{path}}',
        headers: [{ name: 'X-T', value: '{{tenant}}' }],
        body: { type: 'json', content: '{"a":"{{bodyVar}}"}' },
        auth: { type: 'bearer', token: '{{token}}' },
        assertions: [{ target: { type: 'status' }, operator: 'equals', expected: '{{code}}' }],
      });
      const s = reqStep(a);
      const issues = validate(seq([s]), [a]);
      expect(issues.every((i) => i.severity === 'warning')).toBe(true);
      expect(issues.map((i) => i.detail).sort()).toEqual([
        'bodyVar',
        'code',
        'path',
        'tenant',
        'token',
      ]);
    });

    it('tient compte des Surcharges de Variables de l’Étape', () => {
      const a = req({ url: '{{base}}/{{path}}' });
      expect(validate(seq([reqStep(a, { overrides: { variables: { path: 'x' } } })]), [a])).toEqual(
        [],
      );
    });

    it("signale une Variable extraite par une Étape sœur d'un Groupe parallèle", () => {
      const create = req();
      const read = req({ url: '{{base}}/items/{{id}}' });
      const sibling = reqStep(read);
      const after = reqStep(read);
      const root = seq([par([reqStep(create, { extractions: extract('id') }), sibling]), after]);

      expect(codes(validate(root, [create, read]))).toEqual([
        [ScenarioIssueCode.UndefinedVariable, sibling.id, 'id'],
      ]);
    });

    it('signale une Variable extraite seulement plus tard', () => {
      const read = req({ url: '{{base}}/items/{{id}}' });
      const create = req();
      const early = reqStep(read);
      const root = seq([early, reqStep(create, { extractions: extract('id') })]);
      expect(codes(validate(root, [read, create]))).toEqual([
        [ScenarioIssueCode.UndefinedVariable, early.id, 'id'],
      ]);
    });
  });

  it('avertit pour un Groupe vide', () => {
    const empty = par([]);
    expect(validate(seq([empty]), [])).toEqual([
      { stepId: empty.id, severity: 'warning', code: ScenarioIssueCode.EmptyGroup },
    ]);
  });
});
