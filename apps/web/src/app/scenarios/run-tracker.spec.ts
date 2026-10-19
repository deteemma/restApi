import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { GroupStep, RunEvent } from '@restapi/shared';
import { RunTracker } from './run-tracker';

/** EventSource factice : les tests poussent les messages à la main. */
class FakeEventSource {
  static last: FakeEventSource;
  onmessage: ((e: MessageEvent<string>) => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  emit(event: RunEvent) {
    this.onmessage?.({ data: JSON.stringify(event) } as MessageEvent<string>);
  }
  close() {
    this.closed = true;
  }
}

const root: GroupStep = {
  id: 'root',
  type: 'group',
  mode: 'sequential',
  steps: [{ id: 'a', type: 'request', requestId: 'r1', extractions: [] }],
};

describe('RunTracker', () => {
  beforeEach(() => vi.stubGlobal('EventSource', FakeEventSource));
  afterEach(() => vi.unstubAllGlobals());

  it('lance l’Exécution, suit son flux et le ferme à la fin', async () => {
    TestBed.configureTestingModule({
      providers: [RunTracker, provideHttpClient(), provideHttpClientTesting()],
    });
    const tracker = TestBed.inject(RunTracker);
    const http = TestBed.inject(HttpTestingController);

    const starting = tracker.start('s1', root, {
      environmentId: 'e1',
      parameters: { tenant: 'acme' },
    });
    const req = http.expectOne('/api/scenarios/s1/runs');
    expect(req.request.body).toEqual({ environmentId: 'e1', parameters: { tenant: 'acme' } });
    req.flush({ id: 'run1', status: 'running' });
    await starting;

    const source = FakeEventSource.last;
    expect(source.url).toBe('/api/runs/run1/events');
    expect(tracker.running()).toBe(true);
    expect(tracker.state()?.steps['a']?.status).toBe('pending');

    source.emit({ type: 'step.started', stepId: 'a', at: '' });
    expect(tracker.state()?.steps['a']?.status).toBe('running');
    source.emit({ type: 'step.finished', stepId: 'a', status: 'succeeded', at: '' });
    source.emit({ type: 'run.finished', status: 'succeeded', at: '' });

    expect(tracker.running()).toBe(false);
    expect(tracker.state()?.status).toBe('succeeded');
    expect(source.closed).toBe(true);
  });

  it('demande l’arrêt de l’Exécution suivie', async () => {
    TestBed.configureTestingModule({
      providers: [RunTracker, provideHttpClient(), provideHttpClientTesting()],
    });
    const tracker = TestBed.inject(RunTracker);
    const http = TestBed.inject(HttpTestingController);
    tracker.follow({ id: 'run2' } as never, root);

    const stopping = tracker.stop();
    http.expectOne((r) => r.method === 'POST' && r.url === '/api/runs/run2/stop').flush(null);
    await stopping;
  });
});
