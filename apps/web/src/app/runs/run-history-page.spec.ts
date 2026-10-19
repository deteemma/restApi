import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { RunSummaryDto } from '@restapi/shared';
import { translocoTesting } from '../../testing/transloco-testing';
import { HISTORY_PAGE_SIZE, RunHistoryPage } from './run-history-page';

const run = (id: string, partial: Partial<RunSummaryDto> = {}): RunSummaryDto => ({
  id,
  collectionId: 'c1',
  scenarioId: 'sc1',
  scenarioName: 'Parcours',
  environmentName: 'dev',
  status: 'succeeded',
  pinned: false,
  startedAt: `2026-10-19T08:00:${id.padStart(2, '0')}.000Z`,
  finishedAt: null,
  durationMs: 2430,
  stats: {
    requests: { succeeded: 4, failed: 1, skipped: 2, stopped: 0 },
    assertions: { passed: 6, failed: 1 },
  },
  ...partial,
});

describe('RunHistoryPage', () => {
  let http: HttpTestingController;
  const tick = () => new Promise((r) => setTimeout(r));

  async function setup(scenarioId?: string) {
    TestBed.configureTestingModule({
      imports: [RunHistoryPage, translocoTesting()],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(RunHistoryPage);
    fixture.componentRef.setInput('collectionId', 'c1');
    if (scenarioId) fixture.componentRef.setInput('scenarioId', scenarioId);
    fixture.detectChanges();
    await tick();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const pending = (): TestRequest => http.expectOne((r) => r.url === '/api/runs');

  it("liste les Exécutions d'un Scénario avec leurs compteurs", async () => {
    const { fixture, el } = await setup('sc1');
    const req = pending();
    expect(req.request.params.get('scenarioId')).toBe('sc1');
    expect(req.request.params.has('collectionId')).toBe(false);
    req.flush([run('2'), run('1', { status: 'failed', pinned: true })]);
    await fixture.whenStable();

    const rows = el.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain('Réussie');
    expect(rows[0]!.textContent).toContain('2,4 s');
    expect(rows[0]!.textContent).toContain('✓ 4');
    expect(rows[0]!.textContent).toContain('✗ 1');
    expect(rows[1]!.textContent).toContain('Échouée');
    expect(rows[1]!.querySelector('a')!.getAttribute('href')).toBe('/collections/c1/runs/1');
  });

  it('couvre toute la Collection sans Scénario, et affiche alors le nom du Scénario', async () => {
    const { fixture, el } = await setup();
    const req = pending();
    expect(req.request.params.get('collectionId')).toBe('c1');
    req.flush([run('1')]);
    await fixture.whenStable();
    expect(el.querySelector('tbody tr')!.textContent).toContain('Parcours');
  });

  it('recharge selon les filtres, et charge les Exécutions plus anciennes', async () => {
    const { fixture } = await setup('sc1');
    const full = Array.from({ length: HISTORY_PAGE_SIZE }, (_, i) =>
      run(String(HISTORY_PAGE_SIZE - i)),
    );
    pending().flush(full);
    await fixture.whenStable();

    const page = fixture.componentInstance as unknown as {
      loadMore(): void;
      status: { set(v: string): void };
      pinnedOnly: { set(v: boolean): void };
    };
    page.loadMore();
    const more = pending();
    expect(more.request.params.get('before')).toBe(full.at(-1)!.startedAt);
    more.flush([]);
    await fixture.whenStable();

    page.status.set('failed');
    page.pinnedOnly.set(true);
    fixture.detectChanges();
    await tick();
    const filtered = pending();
    expect(filtered.request.params.get('status')).toBe('failed');
    expect(filtered.request.params.get('pinned')).toBe('true');
    filtered.flush([]);
  });

  it('épingle une Exécution depuis la liste', async () => {
    const { fixture, el } = await setup('sc1');
    pending().flush([run('1')]);
    await fixture.whenStable();

    el.querySelector<HTMLButtonElement>('tbody button')!.click();
    const patch = http.expectOne((r) => r.method === 'PATCH' && r.url === '/api/runs/1');
    expect(patch.request.body).toEqual({ pinned: true });
    patch.flush(run('1', { pinned: true }));
    await fixture.whenStable();
    expect(el.querySelector('tbody button')!.getAttribute('aria-pressed')).toBe('true');
  });
});
