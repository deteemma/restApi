import { provideHttpClient, type HttpRequest } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CollectionTree } from '@restapi/shared';
import { WorkspaceStore } from './workspace.store';

const tree = (environments: { id: string; name: string }[] = []): CollectionTree => ({
  collection: { id: 'c1', name: 'Boutique' },
  folders: [],
  requests: [],
  scenarios: [],
  environments,
});

describe('WorkspaceStore', () => {
  let store: WorkspaceStore;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(WorkspaceStore);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  /**
   * Répond aux requêtes de l'action au fil de l'eau (clé « MÉTHODE url »), jusqu'à sa fin.
   * Renvoie les requêtes envoyées, pour en vérifier le contenu.
   */
  async function settle(
    action: Promise<unknown>,
    responses: Record<string, unknown>,
  ): Promise<HttpRequest<unknown>[]> {
    const sent: HttpRequest<unknown>[] = [];
    let done = false;
    const finished = action.finally(() => (done = true));
    while (!done) {
      await new Promise((r) => setTimeout(r));
      for (const pending of http.match(() => true)) {
        const key = `${pending.request.method} ${pending.request.urlWithParams}`;
        if (!(key in responses)) throw new Error(`Requête inattendue : ${key}`);
        sent.push(pending.request);
        pending.flush(responses[key] as object);
      }
    }
    await finished;
    return sent;
  }

  const open = (environments: { id: string; name: string }[] = []) =>
    settle(store.openCollection('c1'), { 'GET /api/collections/c1/tree': tree(environments) });

  it("ouvre une Collection et restaure l'Environnement mémorisé", async () => {
    localStorage.setItem('restapi.environment.c1', 'e2');
    await open([
      { id: 'e1', name: 'dev' },
      { id: 'e2', name: 'prod' },
    ]);
    expect(store.collectionId()).toBe('c1');
    expect(store.environment()?.name).toBe('prod');
  });

  it("ignore un Environnement mémorisé qui n'existe plus", async () => {
    localStorage.setItem('restapi.environment.c1', 'gone');
    await open();
    expect(store.environmentId()).toBeNull();
  });

  it("mémorise l'Environnement choisi pour la Collection ouverte", async () => {
    await open([{ id: 'e1', name: 'dev' }]);
    store.selectEnvironment('e1');
    expect(localStorage.getItem('restapi.environment.c1')).toBe('e1');
    store.selectEnvironment(null);
    expect(localStorage.getItem('restapi.environment.c1')).toBeNull();
  });

  it('crée une Requête GET vide dans le Dossier demandé, puis recharge l’arborescence', async () => {
    await open();
    const sent = await settle(store.createRequest('Lister', 'f1'), {
      'POST /api/collections/c1/requests': { id: 'r1' },
      'GET /api/collections/c1/tree': tree(),
    });
    expect(sent.map((r) => r.method)).toEqual(['POST', 'GET']);
    expect(sent[0]!.body).toMatchObject({ name: 'Lister', folderId: 'f1', method: 'GET', url: '' });
  });

  it('déplace un Dossier vers la racine, puis recharge l’arborescence', async () => {
    await open();
    const sent = await settle(store.moveFolder('f2', null), {
      'PATCH /api/folders/f2': {},
      'GET /api/collections/c1/tree': tree(),
    });
    expect(sent.map((r) => r.method)).toEqual(['PATCH', 'GET']);
    expect(sent[0]!.body).toEqual({ parentId: null });
  });

  it('déplace une Requête dans un Dossier en gardant tout le reste de sa définition', async () => {
    await open();
    const definition = {
      name: 'Lister',
      method: 'POST',
      url: '{{base}}/items',
      query: [],
      headers: [{ name: 'Accept', value: 'application/json', enabled: true }],
      body: { type: 'json', content: '{}' },
      auth: { type: 'inherit' },
      assertions: [],
      settings: { timeoutMs: 5000 },
    };
    const sent = await settle(store.moveRequest('r1', 'f1'), {
      'GET /api/requests/r1': { id: 'r1', collectionId: 'c1', folderId: null, ...definition },
      'PUT /api/requests/r1': {},
      'GET /api/collections/c1/tree': tree(),
    });
    expect(sent.find((r) => r.method === 'PUT')!.body).toEqual({ ...definition, folderId: 'f1' });
  });

  it('renomme un Environnement sans jamais renvoyer ses valeurs secrètes', async () => {
    await open();
    const sent = await settle(store.renameEnvironment('e1', 'production'), {
      'GET /api/environments/e1': {
        id: 'e1',
        collectionId: 'c1',
        name: 'prod',
        variables: [
          { name: 'url', secret: false, value: 'https://x' },
          { name: 'pwd', secret: true, hasValue: true },
        ],
      },
      'PUT /api/environments/e1': {},
      'GET /api/collections/c1/tree': tree(),
    });
    expect(sent.find((r) => r.method === 'PUT')!.body).toEqual({
      name: 'production',
      variables: [
        { name: 'url', secret: false, value: 'https://x' },
        { name: 'pwd', secret: true },
      ],
    });
  });

  it('revient à « aucun Environnement » si celui choisi a été supprimé', async () => {
    await open([{ id: 'e1', name: 'dev' }]);
    store.selectEnvironment('e1');
    await settle(store.deleteEnvironment('e1'), {
      'DELETE /api/environments/e1': null,
      'GET /api/collections/c1/tree': tree(),
    });
    expect(store.environmentId()).toBeNull();
    expect(localStorage.getItem('restapi.environment.c1')).toBeNull();
  });
});
