import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import type { GroupStep, ScenarioDto } from '@restapi/shared';
import { of } from 'rxjs';
import { translocoTesting } from '../../testing/transloco-testing';
import { WorkspaceStore } from '../core/workspace.store';
import { ScenarioPage } from './scenario-page';

class FakeEventSource {
  static urls: string[] = [];
  onmessage = null;
  constructor(url: string) {
    FakeEventSource.urls.push(url);
  }
  close() {}
}

const scenario: ScenarioDto = {
  id: 'sc1',
  collectionId: 'c1',
  name: 'Parcours',
  root: {
    id: 'root',
    type: 'group',
    mode: 'sequential',
    steps: [{ id: 'a', type: 'request', requestId: 'r1', extractions: [] }],
  },
};

describe('ScenarioPage', () => {
  let http: HttpTestingController;
  const dialog = { open: vi.fn() };

  beforeEach(() => vi.stubGlobal('EventSource', FakeEventSource));
  afterEach(() => vi.unstubAllGlobals());

  async function setup() {
    TestBed.configureTestingModule({
      imports: [ScenarioPage, translocoTesting()],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: dialog },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const store = TestBed.inject(WorkspaceStore);
    store.tree.set({
      collection: { id: 'c1', name: 'C' },
      folders: [],
      requests: [{ id: 'r1', name: 'Créer', method: 'POST', folderId: null }],
      scenarios: [],
      environments: [{ id: 'e1', name: 'dev' }],
    });
    store.environmentId.set('e1');
    const fixture = TestBed.createComponent(ScenarioPage);
    fixture.componentRef.setInput('scenarioId', 'sc1');
    fixture.componentRef.setInput('collectionId', 'c1');
    fixture.detectChanges();
    await tick();
    http.expectOne('/api/scenarios/sc1').flush(scenario);
    await fixture.whenStable();
    const page = fixture.componentInstance as unknown as {
      setRoot(root: GroupStep): void;
      launch(): Promise<void>;
      dirty(): boolean;
      issues(): unknown[];
    };
    return { fixture, page, el: fixture.nativeElement as HTMLElement };
  }

  const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

  /** Les Anomalies du brouillon sont demandées au serveur peu après chaque modification. */
  async function answerIssues(issues: unknown[] = []) {
    await tick(450);
    for (const req of http.match('/api/collections/c1/scenario-issues')) req.flush(issues);
  }

  it('affiche l’arbre et les Anomalies du brouillon', async () => {
    const { el, fixture } = await setup();
    await answerIssues([
      { stepId: 'a', severity: 'warning', code: 'UNDEFINED_VARIABLE', detail: 'id' },
    ]);
    await fixture.whenStable();
    expect(el.textContent).toContain('Créer');
    expect(el.textContent).toContain('1 avertissement(s)');
  });

  it("enregistre le brouillon avant de lancer, puis suit l'Exécution", async () => {
    const { page, fixture } = await setup();
    await answerIssues();
    page.setRoot({ ...scenario.root, mode: 'parallel' });
    expect(page.dirty()).toBe(true);
    dialog.open.mockReturnValue({
      afterClosed: () => of({ environmentId: 'e1', parameters: { tenant: 'acme' } }),
    });

    const launching = page.launch();
    await tick();
    const put = http.expectOne((r) => r.method === 'PUT' && r.url === '/api/scenarios/sc1');
    expect(put.request.body.root.mode).toBe('parallel');
    put.flush({ ...scenario, root: { ...scenario.root, mode: 'parallel' } });
    await tick();
    const start = http.expectOne('/api/scenarios/sc1/runs');
    expect(start.request.body).toEqual({ environmentId: 'e1', parameters: { tenant: 'acme' } });
    start.flush({ id: 'run1', status: 'running', environmentName: 'dev' });
    await launching;
    await answerIssues();
    await fixture.whenStable();

    expect(page.dirty()).toBe(false);
    expect(FakeEventSource.urls.at(-1)).toBe('/api/runs/run1/events');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Arrêter');
  });

  it("n'ouvre pas le lancement si l'enregistrement échoue", async () => {
    const { page } = await setup();
    await answerIssues();
    page.setRoot({ ...scenario.root, steps: [], mode: 'parallel' });
    dialog.open.mockClear();
    const launching = page.launch();
    await tick();
    http
      .expectOne((r) => r.method === 'PUT')
      .flush(
        { error: { code: 'VALIDATION_FAILED' } },
        { status: 422, statusText: 'Unprocessable' },
      );
    await launching;
    expect(dialog.open).not.toHaveBeenCalled();
  });
});
