import type { GroupStep, Step } from '@restapi/shared';
import { applyRunEvent, initialRunState, progress } from './run-state';
import {
  duplicateStep,
  findStep,
  groupIds,
  insertStep,
  moveStep,
  parentOf,
  removeStep,
  requestStep,
  updateStep,
} from './scenario-tree';

const req = (id: string): Step => ({ id, type: 'request', requestId: `r-${id}`, extractions: [] });
const tree = (): GroupStep => ({
  id: 'root',
  type: 'group',
  mode: 'sequential',
  steps: [
    req('a'),
    {
      id: 'p',
      type: 'group',
      mode: 'parallel',
      steps: [req('b'), { id: 'q', type: 'group', mode: 'sequential', steps: [req('c')] }],
    },
    { id: 'wait', type: 'pause', durationMs: 100 },
  ],
});

/** Forme compacte : identifiants, avec les enfants des Groupes. */
const shape = (step: Step): unknown =>
  step.type === 'group' ? { [step.id]: step.steps.map(shape) } : step.id;

describe("opérations sur l'arbre d'un Scénario", () => {
  it('trouve une Étape et son parent à toute profondeur', () => {
    expect(findStep(tree(), 'c')?.type).toBe('request');
    expect(parentOf(tree(), 'c')?.id).toBe('q');
    expect(findStep(tree(), 'nope')).toBeNull();
  });

  it('modifie, retire et insère sans toucher à l’arbre d’origine', () => {
    const original = tree();
    const updated = updateStep(original, 'wait', (s) => ({ ...s, durationMs: 5 }) as Step);
    expect((findStep(updated, 'wait') as { durationMs: number }).durationMs).toBe(5);
    expect((findStep(original, 'wait') as { durationMs: number }).durationMs).toBe(100);

    expect(shape(removeStep(original, 'p'))).toEqual({ root: ['a', 'wait'] });
    expect(shape(insertStep(original, 'q', 0, req('x')))).toEqual({
      root: ['a', { p: ['b', { q: ['x', 'c'] }] }, 'wait'],
    });
  });

  it('déplace une Étape vers un autre Groupe', () => {
    expect(shape(moveStep(tree(), 'a', 'q', 1))).toEqual({
      root: [{ p: ['b', { q: ['c', 'a'] }] }, 'wait'],
    });
    expect(shape(moveStep(tree(), 'wait', 'root', 0))).toEqual({
      root: ['wait', 'a', { p: ['b', { q: ['c'] }] }],
    });
  });

  it('refuse de déplacer un Groupe dans lui-même ou dans un descendant', () => {
    const t = tree();
    expect(moveStep(t, 'p', 'q', 0)).toBe(t);
    expect(moveStep(t, 'p', 'p', 0)).toBe(t);
    expect(moveStep(t, 'root', 'p', 0)).toBe(t);
  });

  it('duplique une Étape juste après elle, avec de nouveaux identifiants', () => {
    const t = duplicateStep(tree(), 'q');
    const p = findStep(t, 'p') as GroupStep;
    expect(p.steps).toHaveLength(3);
    const copy = p.steps[2] as GroupStep;
    expect(copy.id).not.toBe('q');
    expect(copy.steps[0]!.id).not.toBe('c');
    expect((copy.steps[0] as { requestId: string }).requestId).toBe('r-c');
  });

  it('liste tous les Groupes, et crée des Étapes aux identifiants uniques', () => {
    expect(groupIds(tree())).toEqual(['root', 'p', 'q']);
    expect(requestStep('r1').id).not.toBe(requestStep('r1').id);
  });
});

describe("état d'une Exécution suivie en direct", () => {
  it('part de « En attente » et suit les événements jusqu’à la fin', () => {
    let state = initialRunState(tree());
    expect(state.steps['c']?.status).toBe('pending');
    expect(progress(state)).toEqual({ done: 0, total: 7 });

    state = applyRunEvent(state, { type: 'step.started', stepId: 'a', at: '' });
    expect(state.steps['a']?.status).toBe('running');

    const result = { assertions: [], extractions: [] };
    state = applyRunEvent(state, {
      type: 'step.finished',
      stepId: 'a',
      status: 'failed',
      at: '',
      result,
    });
    expect(state.steps['a']).toEqual({ status: 'failed', result });

    state = applyRunEvent(state, { type: 'step.finished', stepId: 'b', status: 'skipped', at: '' });
    expect(progress(state)).toEqual({ done: 2, total: 7 });

    state = applyRunEvent(state, { type: 'run.finished', status: 'failed', at: '' });
    expect(state.status).toBe('failed');
  });
});
