import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { TestBed } from '@angular/core/testing';
import type { GroupStep, ScenarioIssue } from '@restapi/shared';
import { translocoTesting } from '../../../testing/transloco-testing';
import type { RunState } from '../run-state';
import type { ScenarioDragData } from '../scenario-dnd';
import { ScenarioDnd } from '../scenario-dnd';
import { ScenarioTreeView } from './scenario-tree-view';

const root: GroupStep = {
  id: 'root',
  type: 'group',
  mode: 'sequential',
  steps: [
    {
      id: 'a',
      type: 'request',
      requestId: 'r1',
      extractions: [{ variable: 'clientId', source: { type: 'jsonPath', path: '$.id' } }],
    },
    { id: 'p', type: 'group', mode: 'parallel', maxConcurrency: 3, steps: [] },
    { id: 'orphan', type: 'request', requestId: 'gone', extractions: [] },
    { id: 'wait', type: 'pause', durationMs: 250 },
  ],
};
const requests = [{ id: 'r1', name: 'Créer un client', method: 'POST' as const, folderId: null }];

type Drop = CdkDragDrop<string, unknown, ScenarioDragData>;

describe('ScenarioTreeView', () => {
  async function setup(
    inputs: { readOnly?: boolean; runState?: RunState; issues?: ScenarioIssue[] } = {},
  ) {
    TestBed.configureTestingModule({ imports: [ScenarioTreeView, translocoTesting()] });
    const fixture = TestBed.createComponent(ScenarioTreeView);
    fixture.componentRef.setInput('root', root);
    fixture.componentRef.setInput('requests', requests);
    fixture.componentRef.setInput('readOnly', inputs.readOnly ?? false);
    if (inputs.runState) fixture.componentRef.setInput('runState', inputs.runState);
    if (inputs.issues) {
      fixture.componentRef.setInput('issues', new Map(inputs.issues.map((i) => [i.stepId, [i]])));
    }
    const roots: GroupStep[] = [];
    const selected: string[] = [];
    fixture.componentInstance.rootChange.subscribe((r) => roots.push(r));
    fixture.componentInstance.stepSelect.subscribe((id) => selected.push(id));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const view = fixture.componentInstance as unknown as { drop(e: Drop): void };
    return { fixture, el, roots, selected, view };
  }

  it('affiche chaque type d’Étape, les Extractions et les Étapes orphelines', async () => {
    const { el } = await setup();
    const text = el.textContent!;
    expect(text).toContain('Créer un client');
    expect(text).toContain('→ clientId');
    expect(text).toContain('max 3');
    expect(text).toContain('Requête supprimée');
    expect(text).toContain('Pause · 250 ms');
  });

  it('publie ses zones de dépôt pour le panneau des Requêtes, sauf en lecture seule', async () => {
    await setup();
    expect(TestBed.inject(ScenarioDnd).dropListIds()).toEqual([
      'scenario-drop-root',
      'scenario-drop-p',
    ]);
  });

  it("dépose une Requête du panneau dans un Groupe et sélectionne l'Étape créée", async () => {
    const { view, roots, selected } = await setup();
    view.drop({
      container: { data: 'p' },
      item: { data: { kind: 'request', request: requests[0]! } },
      currentIndex: 0,
    } as unknown as Drop);
    const parallel = roots[0]!.steps[1] as GroupStep;
    expect(parallel.steps).toHaveLength(1);
    expect(parallel.steps[0]).toMatchObject({ type: 'request', requestId: 'r1' });
    expect(selected).toEqual([parallel.steps[0]!.id]);
  });

  it('déplace une Étape existante vers un autre Groupe', async () => {
    const { view, roots } = await setup();
    view.drop({
      container: { data: 'p' },
      item: { data: { kind: 'step', stepId: 'wait' } },
      currentIndex: 0,
    } as unknown as Drop);
    expect(roots[0]!.steps.map((s) => s.id)).toEqual(['a', 'p', 'orphan']);
    expect((roots[0]!.steps[1] as GroupStep).steps.map((s) => s.id)).toEqual(['wait']);
  });

  it('montre les statuts d’Exécution et masque les commandes en lecture seule', async () => {
    const { el } = await setup({
      readOnly: true,
      runState: {
        status: 'running',
        steps: { a: { status: 'succeeded' }, wait: { status: 'running' } },
      },
    });
    expect(el.querySelector('app-status-icon.succeeded')).not.toBeNull();
    expect(el.querySelector('app-status-icon.running')).not.toBeNull();
    expect(el.querySelector('.handle')).toBeNull();
    expect(el.querySelector('button.add')).toBeNull();
    expect(TestBed.inject(ScenarioDnd).dropListIds()).toEqual([]);
  });

  it('signale une Anomalie sur son Étape', async () => {
    const { el } = await setup({
      issues: [{ stepId: 'orphan', severity: 'error', code: 'ORPHAN_STEP' }],
    });
    expect(el.querySelectorAll('mat-icon.issue.error')).toHaveLength(1);
  });
});
