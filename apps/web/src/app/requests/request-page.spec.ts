import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DEFAULT_HTTP_SETTINGS, type RequestDto, type SendDto } from '@restapi/shared';
import { translocoTesting } from '../../testing/transloco-testing';
import { WorkspaceStore } from '../core/workspace.store';
import { RequestPage } from './request-page';

const saved: RequestDto = {
  id: 'r1',
  collectionId: 'c1',
  folderId: null,
  name: 'Créer un client',
  method: 'POST',
  url: '{{baseUrl}}/clients',
  query: [],
  headers: [],
  body: { type: 'json', content: '{"name":"Ada"}' },
  auth: { type: 'inherit' },
  assertions: [{ target: { type: 'status' }, operator: 'equals', expected: '201' }],
};

const sendResult: SendDto = {
  id: 's1',
  requestId: 'r1',
  at: '2026-10-19T08:00:00.000Z',
  environmentName: 'recette',
  status: 'succeeded',
  result: {
    request: { method: 'POST', url: 'https://x/clients', headers: {}, body: '{}' },
    response: {
      status: 201,
      statusText: 'Created',
      headers: { 'content-type': 'application/json' },
      body: '{"id":7}',
      durationMs: 12,
    },
    assertions: [],
    extractions: [],
  },
};

describe('RequestPage', () => {
  let http: HttpTestingController;

  async function setup() {
    TestBed.configureTestingModule({
      imports: [RequestPage, translocoTesting()],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(WorkspaceStore).environmentId.set('e1');
    const fixture = TestBed.createComponent(RequestPage);
    fixture.componentRef.setInput('requestId', 'r1');
    fixture.componentRef.setInput('collectionId', 'c1');
    fixture.detectChanges();
    await flushPending({
      'GET /api/requests/r1': saved,
      'GET /api/requests/r1/sends': [],
      'GET /api/collections/c1': { id: 'c1', settings: DEFAULT_HTTP_SETTINGS },
    });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const page = fixture.componentInstance as unknown as {
      send(): Promise<void>;
      save(): Promise<void>;
      evaluate(): Promise<void>;
      dirty(): boolean;
    };
    return { fixture, el, page };
  }

  /** Répond aux requêtes en attente (clé « MÉTHODE url »). */
  async function flushPending(responses: Record<string, unknown>) {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r));
      for (const req of http.match(() => true)) {
        const key = `${req.request.method} ${req.request.urlWithParams}`;
        if (key in responses) req.flush(responses[key] as object);
      }
    }
  }

  it("affiche la Requête et n'est pas modifiée au chargement", async () => {
    const { el, page } = await setup();
    expect(el.querySelector('h1')?.textContent).toContain('Créer un client');
    expect(el.querySelector<HTMLInputElement>('input.url')!.value).toBe('{{baseUrl}}/clients');
    expect(page.dirty()).toBe(false);
  });

  it("envoie le brouillon non enregistré avec l'Environnement actif, puis affiche la réponse", async () => {
    const { el, fixture, page } = await setup();
    const url = el.querySelector<HTMLInputElement>('input.url')!;
    url.value = '{{baseUrl}}/clients?draft=1';
    url.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(page.dirty()).toBe(true);

    const sending = page.send();
    const req = http.expectOne('/api/requests/r1/send');
    expect(req.request.body).toMatchObject({
      environmentId: 'e1',
      draft: { url: '{{baseUrl}}/clients?draft=1', method: 'POST' },
    });
    req.flush(sendResult);
    await sending;
    await fixture.whenStable();

    expect(el.querySelector('.status')?.textContent).toContain('201 Created');
    // Envoyer n'enregistre pas.
    expect(page.dirty()).toBe(true);
  });

  it('enregistre le brouillon (PUT) puis recharge l’arborescence', async () => {
    const { el, fixture, page } = await setup();
    const url = el.querySelector<HTMLInputElement>('input.url')!;
    url.value = '{{baseUrl}}/customers';
    url.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    const saving = page.save();
    const put = http.expectOne((r) => r.method === 'PUT' && r.url === '/api/requests/r1');
    expect(put.request.body.url).toBe('{{baseUrl}}/customers');
    put.flush({ ...saved, url: '{{baseUrl}}/customers' });
    await saving;
    expect(page.dirty()).toBe(false);
  });

  it("reprend un renommage fait depuis l'arborescence, sans perdre ni ramener l'ancien nom", async () => {
    const { el, fixture, page } = await setup();
    const url = el.querySelector<HTMLInputElement>('input.url')!;
    url.value = '{{baseUrl}}/customers';
    url.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    TestBed.inject(WorkspaceStore).tree.set({
      collection: { id: 'c1', name: 'Boutique' },
      folders: [],
      requests: [{ id: 'r1', name: 'Créer un compte', method: 'POST', folderId: null }],
      scenarios: [],
      environments: [],
    });
    await fixture.whenStable();
    expect(el.querySelector('h1')?.textContent).toContain('Créer un compte');
    expect(page.dirty()).toBe(true); // seule l'URL reste à enregistrer

    const saving = page.save();
    const put = http.expectOne((r) => r.method === 'PUT' && r.url === '/api/requests/r1');
    expect(put.request.body.name).toBe('Créer un compte');
    put.flush({ ...saved, name: 'Créer un compte', url: '{{baseUrl}}/customers' });
    await flushPending({ 'GET /api/collections/c1/tree': TestBed.inject(WorkspaceStore).tree() });
    await saving;
    expect(page.dirty()).toBe(false);
  });

  it('évalue les Assertions sur la dernière réponse, avec les Variables de l’Environnement', async () => {
    const { page, fixture } = await setup();
    const sending = page.send();
    http.expectOne('/api/requests/r1/send').flush(sendResult);
    await sending;
    await fixture.whenStable();

    const evaluating = page.evaluate();
    const req = http.expectOne('/api/collections/c1/evaluate');
    expect(req.request.body).toEqual({
      response: sendResult.result.response,
      assertions: saved.assertions,
      environmentId: 'e1',
    });
    req.flush({
      assertions: [{ assertion: saved.assertions[0], passed: true, actual: 201 }],
      extractions: [],
    });
    await evaluating;
  });
});
