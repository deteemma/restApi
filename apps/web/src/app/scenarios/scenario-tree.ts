import type { GroupMode, GroupStep, PauseStep, RequestStep, Step } from '@restapi/shared';

/** Opérations sur l'arbre d'un Scénario. Toutes renvoient un nouvel arbre (rien n'est modifié en place). */

export const newStepId = (): string => `s-${crypto.randomUUID().slice(0, 8)}`;

export function requestStep(requestId: string): RequestStep {
  return { id: newStepId(), type: 'request', requestId, extractions: [] };
}

export function groupStep(mode: GroupMode): GroupStep {
  return { id: newStepId(), type: 'group', mode, steps: [] };
}

export function pauseStep(durationMs = 1000): PauseStep {
  return { id: newStepId(), type: 'pause', durationMs };
}

export function findStep(root: GroupStep, id: string): Step | null {
  if (root.id === id) return root;
  for (const child of root.steps) {
    if (child.id === id) return child;
    if (child.type === 'group') {
      const found = findStep(child, id);
      if (found) return found;
    }
  }
  return null;
}

/** Remplace l'Étape `id` par `change(étape)`. */
export function updateStep(root: GroupStep, id: string, change: (step: Step) => Step): GroupStep {
  const visit = (step: Step): Step => {
    if (step.id === id) return change(step);
    return step.type === 'group' ? { ...step, steps: step.steps.map(visit) } : step;
  };
  return visit(root) as GroupStep;
}

export function removeStep(root: GroupStep, id: string): GroupStep {
  const visit = (group: GroupStep): GroupStep => ({
    ...group,
    steps: group.steps.filter((s) => s.id !== id).map((s) => (s.type === 'group' ? visit(s) : s)),
  });
  return visit(root);
}

/** Insère `step` dans le Groupe `groupId`, à la position `index`. */
export function insertStep(root: GroupStep, groupId: string, index: number, step: Step): GroupStep {
  return updateStep(root, groupId, (group) => {
    if (group.type !== 'group') return group;
    const steps = [...group.steps];
    steps.splice(Math.max(0, Math.min(index, steps.length)), 0, step);
    return { ...group, steps };
  });
}

/** Vrai si `id` est `ancestorId` lui-même ou l'un de ses descendants. */
export function isWithin(root: GroupStep, ancestorId: string, id: string): boolean {
  const ancestor = findStep(root, ancestorId);
  return !!ancestor && !!(ancestor.type === 'group' ? findStep(ancestor, id) : ancestor.id === id);
}

/**
 * Déplace une Étape vers le Groupe `groupId`, à la position `index` (calculée après retrait).
 * Sans effet si l'on déplace un Groupe dans lui-même ou dans l'un de ses descendants.
 */
export function moveStep(root: GroupStep, id: string, groupId: string, index: number): GroupStep {
  const step = findStep(root, id);
  if (!step || step.id === root.id || isWithin(root, id, groupId)) return root;
  return insertStep(removeStep(root, id), groupId, index, step);
}

/** Copie d'une Étape (et de ses descendants) avec de nouveaux identifiants, placée juste après. */
export function duplicateStep(root: GroupStep, id: string): GroupStep {
  const parent = parentOf(root, id);
  const step = findStep(root, id);
  if (!parent || !step) return root;
  const index = parent.steps.findIndex((s) => s.id === id);
  return insertStep(root, parent.id, index + 1, withNewIds(step));
}

export function parentOf(root: GroupStep, id: string): GroupStep | null {
  for (const child of root.steps) {
    if (child.id === id) return root;
    if (child.type === 'group') {
      const found = parentOf(child, id);
      if (found) return found;
    }
  }
  return null;
}

export function withNewIds(step: Step): Step {
  return step.type === 'group'
    ? { ...step, id: newStepId(), steps: step.steps.map(withNewIds) }
    : { ...step, id: newStepId() };
}

/** Identifiants de tous les Groupes, racine comprise (listes de dépôt du glisser-déposer). */
export function groupIds(root: GroupStep): string[] {
  const ids: string[] = [];
  const visit = (group: GroupStep) => {
    ids.push(group.id);
    group.steps.forEach((s) => s.type === 'group' && visit(s));
  };
  visit(root);
  return ids;
}

export function allSteps(root: GroupStep): Step[] {
  const out: Step[] = [];
  const visit = (step: Step) => {
    out.push(step);
    if (step.type === 'group') step.steps.forEach(visit);
  };
  visit(root);
  return out;
}
