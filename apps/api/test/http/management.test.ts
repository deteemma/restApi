import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_HTTP_SETTINGS,
  ErrorCode,
  ScenarioIssueCode,
  type CollectionDto,
  type RequestInput,
  type ScenarioInput,
} from '@restapi/shared';
import { startTestApp, type TestApp } from '../support/test-app';

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
}, 120_000);
afterAll(() => t.stop());
beforeEach(() => t.reset());

const UNKNOWN_ID = '0123456789abcdef01234567';

async function createCollection(body: object = { name: 'Boutique' }): Promise<CollectionDto> {
  const res = await t.http.post('/api/collections').send(body).expect(201);
  return res.body as CollectionDto;
}

const minimalRequest = (partial: Partial<RequestInput> = {}) => ({
  name: 'Lister',
  method: 'GET',
  url: '{{baseUrl}}/items',
  ...partial,
});

const scenarioUsing = (requestId: string): ScenarioInput => ({
  name: 'Parcours',
  root: {
    id: 'root',
    type: 'group',
    mode: 'sequential',
    steps: [{ id: 's1', type: 'request', requestId, extractions: [] }],
  },
});

/** Valeur brute d'une Variable telle que stockée dans MongoDB. */
async function storedVariable(collection: string, name: string) {
  const docs = await t.connection.db!.collection(collection).find().toArray();
  const vars = docs.flatMap(
    (d) => d['variables'] as { name: string; value: string; secret: boolean }[],
  );
  return vars.find((v) => v.name === name);
}

describe('Collections', () => {
  it('crée une Collection avec les valeurs par défaut', async () => {
    const c = await createCollection();
    expect(c).toMatchObject({
      name: 'Boutique',
      variables: [],
      auth: { type: 'none' },
      settings: DEFAULT_HTTP_SETTINGS,
    });
    expect(c.id).toMatch(/^[a-f\d]{24}$/);
  });

  it('liste les Collections par nom, puis en lit une', async () => {
    await createCollection({ name: 'Zeta' });
    const alpha = await createCollection({ name: 'Alpha' });
    const list = await t.http.get('/api/collections').expect(200);
    expect(list.body.map((c: CollectionDto) => c.name)).toEqual(['Alpha', 'Zeta']);
    const one = await t.http.get(`/api/collections/${alpha.id}`).expect(200);
    expect(one.body.name).toBe('Alpha');
  });

  it('modifie partiellement, en fusionnant les réglages HTTP', async () => {
    const c = await createCollection();
    const res = await t.http
      .patch(`/api/collections/${c.id}`)
      .send({ name: 'Renommée', settings: { timeoutMs: 5000 } })
      .expect(200);
    expect(res.body.name).toBe('Renommée');
    expect(res.body.settings).toEqual({ ...DEFAULT_HTTP_SETTINGS, timeoutMs: 5000 });
  });

  it('répond NOT_FOUND pour un identifiant inconnu ou mal formé', async () => {
    for (const id of [UNKNOWN_ID, 'pas-un-id']) {
      const res = await t.http.get(`/api/collections/${id}`).expect(404);
      expect(res.body).toEqual({ error: { code: ErrorCode.NotFound } });
    }
  });

  it('répond VALIDATION_FAILED (422) avec les champs en cause', async () => {
    const res = await t.http
      .post('/api/collections')
      .send({ name: '', settings: { timeoutMs: -1 } })
      .expect(422);
    expect(res.body.error.code).toBe(ErrorCode.ValidationFailed);
    expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      'name',
      'settings.timeoutMs',
    ]);
  });

  it('répond VALIDATION_FAILED (400) à un JSON illisible', async () => {
    const res = await t.http
      .post('/api/collections')
      .set('Content-Type', 'application/json')
      .send('{"name":')
      .expect(400);
    expect(res.body.error.code).toBe(ErrorCode.ValidationFailed);
  });

  it('supprime la Collection et tout son contenu', async () => {
    const c = await createCollection();
    const folder = await t.http.post(`/api/collections/${c.id}/folders`).send({ name: 'F' });
    const req = await t.http.post(`/api/collections/${c.id}/requests`).send(minimalRequest());
    const env = await t.http.post(`/api/collections/${c.id}/environments`).send({ name: 'dev' });
    const scn = await t.http
      .post(`/api/collections/${c.id}/scenarios`)
      .send(scenarioUsing(req.body.id));

    await t.http.delete(`/api/collections/${c.id}`).expect(204);

    await t.http.get(`/api/collections/${c.id}`).expect(404);
    await t.http.patch(`/api/folders/${folder.body.id}`).send({ name: 'x' }).expect(404);
    await t.http.get(`/api/requests/${req.body.id}`).expect(404);
    await t.http.get(`/api/environments/${env.body.id}`).expect(404);
    await t.http.get(`/api/scenarios/${scn.body.id}`).expect(404);
  });

  it("renvoie l'arborescence complète", async () => {
    const c = await createCollection();
    const folder = await t.http.post(`/api/collections/${c.id}/folders`).send({ name: 'Clients' });
    const req = await t.http
      .post(`/api/collections/${c.id}/requests`)
      .send(minimalRequest({ method: 'POST', folderId: folder.body.id }));
    await t.http.post(`/api/collections/${c.id}/environments`).send({ name: 'dev' });
    await t.http.post(`/api/collections/${c.id}/scenarios`).send(scenarioUsing(req.body.id));

    const tree = await t.http.get(`/api/collections/${c.id}/tree`).expect(200);
    expect(tree.body).toEqual({
      collection: { id: c.id, name: 'Boutique' },
      folders: [{ id: folder.body.id, collectionId: c.id, parentId: null, name: 'Clients' }],
      requests: [{ id: req.body.id, name: 'Lister', method: 'POST', folderId: folder.body.id }],
      scenarios: [{ id: expect.any(String), name: 'Parcours' }],
      environments: [{ id: expect.any(String), name: 'dev' }],
    });
  });

  it("n'expose pas les données d'un autre propriétaire", async () => {
    const c = await createCollection();
    await expect(t.store.collections.get('someone-else', c.id)).rejects.toMatchObject({
      code: ErrorCode.NotFound,
    });
  });
});

describe('Variables secrètes', () => {
  it('ne renvoie jamais la valeur, et la chiffre dans MongoDB', async () => {
    const c = await createCollection({
      name: 'C',
      variables: [
        { name: 'baseUrl', value: 'https://api.test' },
        { name: 'token', value: 's3cret', secret: true },
        { name: 'empty', value: '', secret: true },
      ],
    });
    expect(c.variables).toEqual([
      { name: 'baseUrl', secret: false, value: 'https://api.test' },
      { name: 'token', secret: true, hasValue: true },
      { name: 'empty', secret: true, hasValue: false },
    ]);
    const stored = await storedVariable('collections', 'token');
    expect(stored?.value).not.toContain('s3cret');
    expect(t.box.open(stored!.value)).toBe('s3cret');
  });

  it('garde la valeur quand la Variable est renvoyée sans valeur, la remplace sinon', async () => {
    const c = await createCollection({
      name: 'C',
      variables: [{ name: 'token', value: 'first', secret: true }],
    });

    await t.http
      .patch(`/api/collections/${c.id}`)
      .send({
        variables: [
          { name: 'token', secret: true },
          { name: 'added', value: 'x' },
        ],
      })
      .expect(200);
    expect(t.box.open((await storedVariable('collections', 'token'))!.value)).toBe('first');

    await t.http
      .patch(`/api/collections/${c.id}`)
      .send({ variables: [{ name: 'token', value: 'second' }] })
      .expect(200);
    expect(t.box.open((await storedVariable('collections', 'token'))!.value)).toBe('second');
    expect(await storedVariable('collections', 'added')).toBeUndefined();
  });

  it("s'applique aussi aux Environnements", async () => {
    const c = await createCollection();
    const env = await t.http
      .post(`/api/collections/${c.id}/environments`)
      .send({ name: 'prod', variables: [{ name: 'pwd', value: 'p@ss', secret: true }] })
      .expect(201);
    expect(env.body.variables).toEqual([{ name: 'pwd', secret: true, hasValue: true }]);

    const renamed = await t.http
      .put(`/api/environments/${env.body.id}`)
      .send({ name: 'production', variables: [{ name: 'pwd' }] })
      .expect(200);
    expect(renamed.body.variables).toEqual([{ name: 'pwd', secret: true, hasValue: true }]);
    expect(t.box.open((await storedVariable('environments', 'pwd'))!.value)).toBe('p@ss');
  });

  it('refuse deux Variables du même nom ou un nom invalide', async () => {
    const res = await t.http
      .post('/api/collections')
      .send({
        name: 'C',
        variables: [
          { name: 'a', value: '1' },
          { name: 'a', value: '2' },
        ],
      })
      .expect(422);
    expect(res.body.error.code).toBe(ErrorCode.ValidationFailed);
    await t.http
      .post('/api/collections')
      .send({ name: 'C', variables: [{ name: 'with space', value: '1' }] })
      .expect(422);
  });
});

describe('Dossiers', () => {
  it('imbrique des Dossiers et refuse un parent hors de la Collection', async () => {
    const c = await createCollection();
    const other = await createCollection({ name: 'Autre' });
    const parent = await t.http
      .post(`/api/collections/${c.id}/folders`)
      .send({ name: 'A' })
      .expect(201);
    const child = await t.http
      .post(`/api/collections/${c.id}/folders`)
      .send({ name: 'B', parentId: parent.body.id })
      .expect(201);
    expect(child.body.parentId).toBe(parent.body.id);

    const res = await t.http
      .post(`/api/collections/${other.id}/folders`)
      .send({ name: 'X', parentId: parent.body.id })
      .expect(422);
    expect(res.body.error.details[0].path).toBe('parentId');
  });

  it('refuse de déplacer un Dossier dans son propre descendant', async () => {
    const c = await createCollection();
    const a = await t.http.post(`/api/collections/${c.id}/folders`).send({ name: 'A' });
    const b = await t.http
      .post(`/api/collections/${c.id}/folders`)
      .send({ name: 'B', parentId: a.body.id });

    await t.http.patch(`/api/folders/${a.body.id}`).send({ parentId: b.body.id }).expect(422);
    await t.http.patch(`/api/folders/${a.body.id}`).send({ parentId: a.body.id }).expect(422);
    const moved = await t.http
      .patch(`/api/folders/${b.body.id}`)
      .send({ parentId: null })
      .expect(200);
    expect(moved.body.parentId).toBeNull();
  });

  it('refuse de supprimer un Dossier non vide (FOLDER_NOT_EMPTY)', async () => {
    const c = await createCollection();
    const f = await t.http.post(`/api/collections/${c.id}/folders`).send({ name: 'F' });
    const r = await t.http
      .post(`/api/collections/${c.id}/requests`)
      .send(minimalRequest({ folderId: f.body.id }));

    const res = await t.http.delete(`/api/folders/${f.body.id}`).expect(409);
    expect(res.body.error.code).toBe(ErrorCode.FolderNotEmpty);

    await t.http.delete(`/api/requests/${r.body.id}`).expect(204);
    await t.http.delete(`/api/folders/${f.body.id}`).expect(204);
  });
});

describe('Requêtes', () => {
  it('crée une Requête avec les valeurs par défaut', async () => {
    const c = await createCollection();
    const res = await t.http
      .post(`/api/collections/${c.id}/requests`)
      .send(minimalRequest())
      .expect(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      collectionId: c.id,
      folderId: null,
      name: 'Lister',
      method: 'GET',
      url: '{{baseUrl}}/items',
      query: [],
      headers: [],
      body: { type: 'none' },
      auth: { type: 'inherit' },
      assertions: [],
    });
  });

  it('remplace la définition avec PUT, y compris en retirant les réglages propres', async () => {
    const c = await createCollection();
    const created = await t.http
      .post(`/api/collections/${c.id}/requests`)
      .send(minimalRequest({ settings: { timeoutMs: 1000 } }));
    expect(created.body.settings).toEqual({ timeoutMs: 1000 });

    const res = await t.http
      .put(`/api/requests/${created.body.id}`)
      .send(
        minimalRequest({
          name: 'Créer',
          method: 'POST',
          body: { type: 'json', content: '{"a":1}' },
          assertions: [{ target: { type: 'status' }, operator: 'equals', expected: '201' }],
        }),
      )
      .expect(200);
    expect(res.body).toMatchObject({ name: 'Créer', method: 'POST', body: { type: 'json' } });
    expect(res.body.settings).toBeUndefined();
    expect(res.body.assertions).toHaveLength(1);
  });

  it('refuse une méthode, un opérateur ou un Dossier invalide', async () => {
    const c = await createCollection();
    const other = await createCollection({ name: 'Autre' });
    const foreignFolder = await t.http
      .post(`/api/collections/${other.id}/folders`)
      .send({ name: 'F' });
    const url = `/api/collections/${c.id}/requests`;

    await t.http
      .post(url)
      .send(minimalRequest({ method: 'PUSH' as never }))
      .expect(422);
    await t.http
      .post(url)
      .send(
        minimalRequest({
          assertions: [{ target: { type: 'status' }, operator: 'between' as never }],
        }),
      )
      .expect(422);
    const res = await t.http
      .post(url)
      .send(minimalRequest({ folderId: foreignFolder.body.id }))
      .expect(422);
    expect(res.body.error.details[0].path).toBe('folderId');
  });

  it('refuse de supprimer une Requête utilisée (REQUEST_IN_USE), sauf en forçant', async () => {
    const c = await createCollection();
    const r = await t.http.post(`/api/collections/${c.id}/requests`).send(minimalRequest());
    const s = await t.http
      .post(`/api/collections/${c.id}/scenarios`)
      .send(scenarioUsing(r.body.id));

    const refused = await t.http.delete(`/api/requests/${r.body.id}`).expect(409);
    expect(refused.body).toEqual({
      error: {
        code: ErrorCode.RequestInUse,
        details: { scenarios: [{ id: s.body.id, name: 'Parcours' }] },
      },
    });

    await t.http.delete(`/api/requests/${r.body.id}?force=true`).expect(204);
    const issues = await t.http.get(`/api/scenarios/${s.body.id}/issues`).expect(200);
    expect(issues.body).toContainEqual({
      stepId: 's1',
      severity: 'error',
      code: ScenarioIssueCode.OrphanStep,
      detail: r.body.id,
    });
  });
});

describe('Scénarios', () => {
  it('enregistre et relit un arbre imbriqué', async () => {
    const c = await createCollection();
    const r = await t.http.post(`/api/collections/${c.id}/requests`).send(minimalRequest());
    const input: ScenarioInput = {
      name: 'Complet',
      root: {
        id: 'root',
        type: 'group',
        mode: 'sequential',
        steps: [
          {
            id: 'p',
            type: 'group',
            mode: 'parallel',
            maxConcurrency: 3,
            stopOnFailure: false,
            steps: [
              {
                id: 'r1',
                type: 'request',
                requestId: r.body.id,
                overrides: { variables: { page: '2' } },
                extractions: [
                  { variable: 'firstId', source: { type: 'jsonPath', path: '$[0].id' } },
                ],
              },
            ],
          },
          { id: 'wait', type: 'pause', durationMs: 500 },
        ],
      },
    };
    const created = await t.http.post(`/api/collections/${c.id}/scenarios`).send(input).expect(201);
    const read = await t.http.get(`/api/scenarios/${created.body.id}`).expect(200);
    expect(read.body).toEqual({ id: created.body.id, collectionId: c.id, ...input });
  });

  it("valide l'arbre en profondeur", async () => {
    const c = await createCollection();
    const res = await t.http
      .post(`/api/collections/${c.id}/scenarios`)
      .send({
        name: 'Faux',
        root: {
          id: 'root',
          type: 'group',
          mode: 'sequential',
          steps: [{ id: 'p', type: 'pause', durationMs: -1 }],
        },
      })
      .expect(422);
    expect(res.body.error.code).toBe(ErrorCode.ValidationFailed);
  });

  it('calcule les Anomalies avec les Variables de la Collection et de ses Environnements', async () => {
    const c = await createCollection({
      name: 'C',
      variables: [{ name: 'baseUrl', value: 'http://x' }],
    });
    await t.http
      .post(`/api/collections/${c.id}/environments`)
      .send({ name: 'dev', variables: [{ name: 'token', value: 't', secret: true }] });
    const r = await t.http
      .post(`/api/collections/${c.id}/requests`)
      .send(minimalRequest({ url: '{{baseUrl}}/items/{{token}}/{{missing}}' }));
    const s = await t.http
      .post(`/api/collections/${c.id}/scenarios`)
      .send(scenarioUsing(r.body.id));

    const issues = await t.http.get(`/api/scenarios/${s.body.id}/issues`).expect(200);
    expect(issues.body).toEqual([
      {
        stepId: 's1',
        severity: 'warning',
        code: ScenarioIssueCode.UndefinedVariable,
        detail: 'missing',
      },
    ]);
  });

  it('modifie puis supprime un Scénario', async () => {
    const c = await createCollection();
    const r = await t.http.post(`/api/collections/${c.id}/requests`).send(minimalRequest());
    const s = await t.http
      .post(`/api/collections/${c.id}/scenarios`)
      .send(scenarioUsing(r.body.id));

    const updated = await t.http
      .put(`/api/scenarios/${s.body.id}`)
      .send({ ...scenarioUsing(r.body.id), name: 'Renommé' })
      .expect(200);
    expect(updated.body.name).toBe('Renommé');
    const list = await t.http.get(`/api/collections/${c.id}/scenarios`).expect(200);
    expect(list.body).toHaveLength(1);

    await t.http.delete(`/api/scenarios/${s.body.id}`).expect(204);
    // Plus aucun Scénario ne l'utilise : la Requête se supprime sans forcer.
    await t.http.delete(`/api/requests/${r.body.id}`).expect(204);
  });
});
