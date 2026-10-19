import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { RunDto } from '@restapi/shared';
import { translocoTesting } from '../../testing/transloco-testing';
import { RunDetailPage } from './run-detail-page';

class FakeEventSource {
  static urls: string[] = [];
  onmessage = null;
  constructor(url: string) {
    FakeEventSource.urls.push(url);
  }
  close() {}
}

const runDto = (partial: Partial<RunDto> = {}): RunDto => ({
  id: 'run1',
  collectionId: 'c1',
  scenarioId: 'sc1',
  scenarioName: 'Parcours',
  environmentName: 'dev',
  status: 'failed',
  pinned: false,
  startedAt: '2026-10-19T08:00:00.000Z',
  finishedAt: '2026-10-19T08:00:01.000Z',
  durationMs: 1000,
  stats: {
    requests: { succeeded: 1, failed: 1, skipped: 0, stopped: 0 },
    assertions: { passed: 1, failed: 1 },
  },
  snapshot: {
    scenario: {
      id: 'sc1',
      name: 'Parcours',
      root: {
        id: 'root',
        type: 'group',
        mode: 'sequential',
        steps: [
          { id: 'a', type: 'request', requestId: 'r1', extractions: [] },
          { id: 'b', type: 'request', requestId: 'r2', extractions: [] },
        ],
      },
    },
    requests: {
      r1: {
        id: 'r1',
        name: 'Créer',
        method: 'POST',
        url: '',
        query: [],
        headers: [],
        body: { type: 'none' },
        auth: { type: 'inherit' },
        assertions: [],
      },
      r2: {
        id: 'r2',
        name: 'Lire',
        method: 'GET',
        url: '',
        query: [],
        headers: [],
        body: { type: 'none' },
        auth: { type: 'inherit' },
        assertions: [],
      },
    },
    collection: {
      variables: {},
      auth: { type: 'none' },
      settings: { timeoutMs: 30000, followRedirects: true, ignoreTlsErrors: false },
    },
    environment: { name: 'dev', variables: {} },
    parameters: { tenant: 'acme' },
  },
  steps: [
    {
      stepId: 'a',
      status: 'succeeded',
      startedAt: null,
      finishedAt: '',
      result: { assertions: [], extractions: [] },
    },
    {
      stepId: 'b',
      status: 'failed',
      startedAt: null,
      finishedAt: '',
      result: {
        assertions: [],
        extractions: [],
        error: { code: 'UNEXPECTED_STATUS' },
        response: { status: 404, statusText: 'Not Found', headers: {}, body: '', durationMs: 5 },
      },
    },
    { stepId: 'root', status: 'failed', startedAt: null, finishedAt: '' },
  ],
  variables: {},
  ...partial,
});

describe('RunDetailPage', () => {
  let http: HttpTestingController;
  beforeEach(() => vi.stubGlobal('EventSource', FakeEventSource));
  afterEach(() => vi.unstubAllGlobals());

  async function setup(run: RunDto) {
    TestBed.configureTestingModule({
      imports: [RunDetailPage, translocoTesting()],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(RunDetailPage);
    fixture.componentRef.setInput('runId', 'run1');
    fixture.componentRef.setInput('collectionId', 'c1');
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r));
    http.expectOne('/api/runs/run1').flush(run);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it("affiche l'Instantané avec les statuts, les Paramètres, et ouvre l'Étape échouée", async () => {
    const { el } = await setup(runDto());
    expect(el.querySelector('.summary')!.textContent).toContain('Échouée');
    expect(el.textContent).toContain('tenant=acme');
    expect(el.querySelectorAll('app-scenario-tree-view app-status-icon.succeeded')).toHaveLength(1);
    // L'Étape échouée est sélectionnée d'emblée : son résultat est affiché.
    expect(el.querySelector('app-step-result')!.textContent).toContain('404 Not Found');
  });

  it('épingle l’Exécution', async () => {
    const { el, fixture } = await setup(runDto());
    const pin = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Épingler'),
    )!;
    pin.click();
    http.expectOne((r) => r.method === 'PATCH').flush({ ...runDto(), pinned: true });
    await fixture.whenStable();
    expect(el.textContent).toContain('Désépingler');
  });

  it('suit en direct une Exécution encore en cours', async () => {
    await setup(
      runDto({ status: 'running', steps: [], finishedAt: null, durationMs: null, stats: null }),
    );
    expect(FakeEventSource.urls.at(-1)).toBe('/api/runs/run1/events');
  });
});
