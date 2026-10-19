import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  EXPORT_FORMAT,
  ErrorCode,
  ScenarioIssueCode,
  type CollectionExport,
  type CollectionTree,
  type GroupStep,
  type RequestStep,
} from '@restapi/shared';
import { startTestApp, type TestApp } from '../support/test-app';

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
}, 120_000);
afterAll(() => t.stop());
beforeEach(() => t.reset());

/** Une Collection complète : Dossiers imbriqués, Requêtes, Environnement, Scénario avec Groupes. */
async function richCollection() {
  const c = (
    await t.http
      .post('/api/collections')
      .send({
        name: 'Boutique éco',
        variables: [
          { name: 'baseUrl', value: 'https://api.test' },
          { name: 'token', value: 'tr3s-s3cret', secret: true },
        ],
        auth: { type: 'bearer', token: '{{token}}' },
        settings: { timeoutMs: 5000 },
      })
      .expect(201)
  ).body;
  const parent = (await t.http.post(`/api/collections/${c.id}/folders`).send({ name: 'Clients' }))
    .body;
  const child = (
    await t.http
      .post(`/api/collections/${c.id}/folders`)
      .send({ name: 'Archives', parentId: parent.id })
  ).body;
  const create = (
    await t.http.post(`/api/collections/${c.id}/requests`).send({
      name: 'Créer',
      method: 'POST',
      url: '{{baseUrl}}/clients',
      folderId: parent.id,
      body: { type: 'json', content: '{"a":1}' },
      assertions: [{ target: { type: 'status' }, operator: 'equals', expected: '201' }],
    })
  ).body;
  const read = (
    await t.http
      .post(`/api/collections/${c.id}/requests`)
      .send({ name: 'Lire', method: 'GET', url: '{{baseUrl}}/clients/{{id}}', folderId: child.id })
  ).body;
  await t.http.post(`/api/collections/${c.id}/environments`).send({
    name: 'prod',
    variables: [
      { name: 'pwd', value: 'p@ss', secret: true },
      { name: 'region', value: 'eu' },
    ],
  });
  await t.http.post(`/api/collections/${c.id}/scenarios`).send({
    name: 'Parcours',
    root: {
      id: 'root',
      type: 'group',
      mode: 'sequential',
      steps: [
        {
          id: 'p',
          type: 'group',
          mode: 'parallel',
          maxConcurrency: 2,
          steps: [
            {
              id: 'c',
              type: 'request',
              requestId: create.id,
              extractions: [{ variable: 'id', source: { type: 'jsonPath', path: '$.id' } }],
            },
          ],
        },
        { id: 'w', type: 'pause', durationMs: 100 },
        { id: 'r', type: 'request', requestId: read.id, extractions: [] },
      ],
    },
  });
  return { collectionId: c.id as string, createId: create.id as string };
}

async function exportOf(collectionId: string): Promise<CollectionExport> {
  const res = await t.http.get(`/api/collections/${collectionId}/export`).expect(200);
  return JSON.parse(res.text) as CollectionExport;
}

describe('export', () => {
  it('produit un fichier versionné, téléchargeable, sans aucune valeur secrète', async () => {
    const { collectionId } = await richCollection();
    const res = await t.http.get(`/api/collections/${collectionId}/export`).expect(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain(
      "filename*=UTF-8''Boutique%20%C3%A9co.restapi.json",
    );

    const data = JSON.parse(res.text) as CollectionExport;
    expect(data).toMatchObject({ format: EXPORT_FORMAT, schemaVersion: 1 });
    expect(data.collection.variables).toEqual([
      { name: 'baseUrl', secret: false, value: 'https://api.test' },
      { name: 'token', secret: true },
    ]);
    expect(data.environments[0]!.variables).toEqual([
      { name: 'pwd', secret: true },
      { name: 'region', secret: false, value: 'eu' },
    ]);
    expect(res.text).not.toContain('tr3s-s3cret');
    expect(res.text).not.toContain('p@ss');
    expect(data.folders).toHaveLength(2);
    expect(data.requests.map((r) => r.name).sort()).toEqual(['Créer', 'Lire']);
  });

  it('répond NOT_FOUND pour une Collection inconnue', async () => {
    await t.http.get('/api/collections/0123456789abcdef01234567/export').expect(404);
  });
});

describe('import', () => {
  it('recrée une Collection identique, avec de nouveaux identifiants et des références à jour', async () => {
    const { collectionId, createId } = await richCollection();
    const data = await exportOf(collectionId);

    const imported = (await t.http.post('/api/collections/import').send(data).expect(201)).body;
    expect(imported.id).not.toBe(collectionId);
    expect(imported).toMatchObject({
      name: 'Boutique éco',
      auth: { type: 'bearer', token: '{{token}}' },
      settings: { timeoutMs: 5000 },
    });
    // Variable secrète importée sans valeur.
    expect(imported.variables).toEqual([
      { name: 'baseUrl', secret: false, value: 'https://api.test' },
      { name: 'token', secret: true, hasValue: false },
    ]);

    const tree = (await t.http.get(`/api/collections/${imported.id}/tree`).expect(200))
      .body as CollectionTree;
    const clients = tree.folders.find((f) => f.name === 'Clients')!;
    const archives = tree.folders.find((f) => f.name === 'Archives')!;
    expect(archives.parentId).toBe(clients.id);
    expect(tree.requests.find((r) => r.name === 'Lire')!.folderId).toBe(archives.id);
    expect(tree.environments.map((e) => e.name)).toEqual(['prod']);

    // Le Scénario pointe vers les nouvelles Requêtes et n'a aucune Anomalie bloquante.
    const scenario = (await t.http.get(`/api/scenarios/${tree.scenarios[0]!.id}`).expect(200)).body;
    const step = ((scenario.root as GroupStep).steps[0] as GroupStep).steps[0] as RequestStep;
    const newCreate = tree.requests.find((r) => r.name === 'Créer')!;
    expect(step.requestId).toBe(newCreate.id);
    expect(step.requestId).not.toBe(createId);
    const issues = (await t.http.get(`/api/scenarios/${scenario.id}/issues`).expect(200)).body;
    expect(issues.filter((i: { severity: string }) => i.severity === 'error')).toEqual([]);

    // Un nouvel export de la copie est identique à l'original (hors identifiants et date).
    const strip = (d: CollectionExport) =>
      JSON.parse(JSON.stringify({ ...d, exportedAt: '' }).replace(/"[a-f\d]{24}"/g, '"id"'));
    expect(strip(await exportOf(imported.id))).toEqual(strip(data));
  });

  it('garde comme orpheline une Étape dont la Requête manque dans le fichier', async () => {
    const { collectionId } = await richCollection();
    const data = await exportOf(collectionId);
    data.requests = data.requests.filter((r) => r.name !== 'Lire');

    const imported = (await t.http.post('/api/collections/import').send(data).expect(201)).body;
    const tree = (await t.http.get(`/api/collections/${imported.id}/tree`)).body as CollectionTree;
    const issues = (await t.http.get(`/api/scenarios/${tree.scenarios[0]!.id}/issues`)).body;
    expect(issues).toContainEqual(
      expect.objectContaining({ stepId: 'r', code: ScenarioIssueCode.OrphanStep }),
    );
  });

  it('refuse un fichier d’un autre format ou d’une autre version', async () => {
    const { collectionId } = await richCollection();
    const data = await exportOf(collectionId);
    const wrongVersion = await t.http
      .post('/api/collections/import')
      .send({ ...data, schemaVersion: 2 })
      .expect(422);
    expect(wrongVersion.body.error.details.map((d: { path: string }) => d.path)).toContain(
      'schemaVersion',
    );
    await t.http
      .post('/api/collections/import')
      .send({ ...data, format: 'postman' })
      .expect(422);
  });

  it('refuse des références incohérentes, sans rien créer', async () => {
    const { collectionId } = await richCollection();
    const data = await exportOf(collectionId);
    const [a, b] = data.folders;
    a!.parentRef = b!.ref;
    b!.parentRef = a!.ref; // boucle
    data.requests[0]!.folderRef = 'inconnu';

    const before = (await t.http.get('/api/collections')).body.length;
    const res = await t.http.post('/api/collections/import').send(data).expect(422);
    expect(res.body.error.code).toBe(ErrorCode.ValidationFailed);
    expect(res.body.error.details.map((d: { message: string }) => d.message)).toEqual(
      expect.arrayContaining(['folder cycle', 'unknown folder']),
    );
    expect((await t.http.get('/api/collections')).body).toHaveLength(before);
  });
});
