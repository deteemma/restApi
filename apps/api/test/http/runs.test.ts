import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ErrorCode,
  ScenarioIssueCode,
  SECRET_MASK,
  type GroupStep,
  type RequestInput,
  type RunDto,
  type RunEvent,
  type RunSummaryDto,
  type SendDto,
} from '@restapi/shared';
import { TargetApi } from '../support/target-api';
import { startTestApp, type TestApp } from '../support/test-app';

let t: TestApp;
let target: TargetApi;

beforeAll(async () => {
  [t, target] = await Promise.all([startTestApp(), TargetApi.start()]);
}, 120_000);
afterAll(async () => {
  await Promise.all([t.stop(), target.close()]);
});
beforeEach(async () => {
  await t.reset();
  target.reset();
});

const SECRET = 'tr3s-s3cret';

/** Collection pointant vers l'API cible, avec un token secret et un Environnement « dev ». */
async function setup() {
  const collection = await t.http
    .post('/api/collections')
    .send({
      name: 'Cible',
      variables: [
        { name: 'base', value: target.url },
        { name: 'token', value: SECRET, secret: true },
      ],
    })
    .expect(201);
  const cid = collection.body.id as string;
  const env = await t.http
    .post(`/api/collections/${cid}/environments`)
    .send({ name: 'dev', variables: [{ name: 'who', value: 'from-env' }] })
    .expect(201);
  const addRequest = async (input: Partial<RequestInput>) =>
    (
      await t.http
        .post(`/api/collections/${cid}/requests`)
        .send({ name: 'r', method: 'GET', url: '{{base}}/echo', ...input })
        .expect(201)
    ).body.id as string;
  const addScenario = async (steps: GroupStep['steps'], name = 'Scénario') =>
    (
      await t.http
        .post(`/api/collections/${cid}/scenarios`)
        .send({ name, root: { id: 'root', type: 'group', mode: 'sequential', steps } })
        .expect(201)
    ).body.id as string;
  return { cid, envId: env.body.id as string, addRequest, addScenario };
}

const reqStep = (id: string, requestId: string, extra: object = {}) => ({
  id,
  type: 'request' as const,
  requestId,
  extractions: [],
  ...extra,
});

async function launch(scenarioId: string, body: object = {}): Promise<RunSummaryDto> {
  return (await t.http.post(`/api/scenarios/${scenarioId}/runs`).send(body).expect(202)).body;
}

async function finished(runId: string): Promise<RunDto> {
  await t.runs.idle();
  return (await t.http.get(`/api/runs/${runId}`).expect(200)).body;
}

/** Lit tout le flux SSE d'une Exécution (il se ferme après run.finished). */
async function readEvents(runId: string): Promise<RunEvent[]> {
  const res = await fetch(`${t.url}/api/runs/${runId}/events`);
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  const text = await res.text();
  return text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice('data: '.length)) as RunEvent);
}

describe('lancer une Exécution', () => {
  it('répond 202 « En cours », puis enregistre le résultat complet de chaque Étape', async () => {
    const { envId, addRequest, addScenario } = await setup();
    const create = await addRequest({
      method: 'POST',
      url: '{{base}}/items',
      body: { type: 'json', content: '{"who":"{{who}}"}' },
    });
    const read = await addRequest({ url: '{{base}}/items/{{itemId}}' });
    const scenarioId = await addScenario([
      reqStep('create', create, {
        extractions: [{ variable: 'itemId', source: { type: 'jsonPath', path: '$.id' } }],
      }),
      reqStep('read', read),
    ]);

    const run = await launch(scenarioId, { environmentId: envId });
    expect(run).toMatchObject({
      status: 'running',
      scenarioName: 'Scénario',
      environmentName: 'dev',
    });

    const done = await finished(run.id);
    expect(done.status).toBe('succeeded');
    expect(done.durationMs).toBeGreaterThanOrEqual(0);
    expect(done.steps.map((s) => [s.stepId, s.status])).toEqual([
      ['create', 'succeeded'],
      ['read', 'succeeded'],
      ['root', 'succeeded'],
    ]);
    expect(JSON.parse(done.steps[0]!.result!.response!.body).who).toBe('from-env');
    expect(done.variables['itemId']).toMatch(/^\d+$/);
    expect(done.stats).toEqual({
      requests: { succeeded: 2, failed: 0, skipped: 0, stopped: 0 },
      assertions: { passed: 0, failed: 0 },
    });
    expect(done.snapshot.scenario.root.steps).toHaveLength(2);
  });

  it('utilise les Paramètres de lancement', async () => {
    const { addRequest, addScenario } = await setup();
    const r = await addRequest({ url: '{{base}}/echo?tenant={{tenant}}' });
    const scenarioId = await addScenario([reqStep('s', r)]);

    const done = await finished((await launch(scenarioId, { parameters: { tenant: 'acme' } })).id);
    expect(JSON.parse(done.steps[0]!.result!.response!.body).query).toEqual({ tenant: 'acme' });
  });

  it('compte les Assertions réussies et échouées', async () => {
    const { addRequest, addScenario } = await setup();
    const r = await addRequest({
      assertions: [
        { target: { type: 'status' }, operator: 'equals', expected: '200' },
        { target: { type: 'jsonPath', path: '$.method' }, operator: 'equals', expected: 'POST' },
      ],
    });
    const done = await finished((await launch(await addScenario([reqStep('s', r)]))).id);
    expect(done.status).toBe('failed');
    expect(done.stats?.assertions).toEqual({ passed: 1, failed: 1 });
  });

  it('refuse un Scénario avec des Anomalies bloquantes (SCENARIO_INVALID)', async () => {
    const { addScenario } = await setup();
    const scenarioId = await addScenario([reqStep('orphan', '0123456789abcdef01234567')]);

    const res = await t.http.post(`/api/scenarios/${scenarioId}/runs`).send({}).expect(422);
    expect(res.body.error.code).toBe(ErrorCode.ScenarioInvalid);
    expect(res.body.error.details).toEqual([
      expect.objectContaining({ code: ScenarioIssueCode.OrphanStep, stepId: 'orphan' }),
    ]);
  });

  it("refuse un Environnement d'une autre Collection", async () => {
    const { addRequest, addScenario } = await setup();
    const other = await setup();
    const scenarioId = await addScenario([reqStep('s', await addRequest({}))]);

    const res = await t.http
      .post(`/api/scenarios/${scenarioId}/runs`)
      .send({ environmentId: other.envId })
      .expect(422);
    expect(res.body.error.details[0].path).toBe('environmentId');
  });

  it("refuse au-delà du plafond d'Exécutions simultanées (TOO_MANY_RUNS)", async () => {
    const limited = await startTestApp({ runs: { maxConcurrentRuns: 1 } });
    try {
      const c = await limited.http.post('/api/collections').send({ name: 'C' });
      const s = await limited.http.post(`/api/collections/${c.body.id}/scenarios`).send({
        name: 'Long',
        root: {
          id: 'root',
          type: 'group',
          mode: 'sequential',
          steps: [{ id: 'p', type: 'pause', durationMs: 5000 }],
        },
      });
      const first = await limited.http
        .post(`/api/scenarios/${s.body.id}/runs`)
        .send({})
        .expect(202);
      const refused = await limited.http
        .post(`/api/scenarios/${s.body.id}/runs`)
        .send({})
        .expect(429);
      expect(refused.body.error.code).toBe(ErrorCode.TooManyRuns);
      await limited.http.post(`/api/runs/${first.body.id}/stop`).expect(202);
    } finally {
      await limited.stop();
    }
  }, 60_000);
});

describe('valeurs secrètes', () => {
  it("n'apparaissent nulle part dans l'Exécution enregistrée ni dans le flux", async () => {
    const { addRequest, addScenario } = await setup();
    const r = await addRequest({
      method: 'POST',
      url: '{{base}}/echo?t={{token}}',
      headers: [{ name: 'X-Token', value: '{{token}}' }],
      auth: { type: 'basic', username: 'u', password: '{{token}}' },
      body: { type: 'text', content: 'token={{token}}' },
    });
    const scenarioId = await addScenario([
      reqStep('s', r, {
        extractions: [
          { variable: 'echoed', source: { type: 'jsonPath', path: '$.headers.x-token' } },
        ],
      }),
    ]);

    const run = await launch(scenarioId);
    const done = await finished(run.id);
    const events = await readEvents(run.id);

    // La cible a bien reçu le vrai secret…
    expect(target.callsTo('/echo')[0]?.headers['x-token']).toBe(SECRET);
    // … mais rien de ce qui est stocké ou diffusé ne le contient.
    expect(JSON.stringify(done)).not.toContain(SECRET);
    expect(JSON.stringify(events)).not.toContain(SECRET);
    expect(done.steps[0]!.result!.request!.headers['Authorization']).toBe(`Basic ${SECRET_MASK}`);
    expect(done.snapshot.collection.variables['token']).toBe(SECRET_MASK);
    expect(done.variables['echoed']).toBe(SECRET_MASK);
    const raw = JSON.stringify(await t.connection.db!.collection('run_steps').find().toArray());
    expect(raw).not.toContain(SECRET);
  });
});

describe('suivi en direct (SSE)', () => {
  it("diffuse les événements d'une Exécution en cours jusqu'à run.finished", async () => {
    const { addRequest, addScenario } = await setup();
    const slow = await addRequest({ url: '{{base}}/delay/150' });
    const scenarioId = await addScenario([reqStep('a', slow), reqStep('b', slow)]);

    const run = await launch(scenarioId);
    const events = await readEvents(run.id);

    expect(
      events.map((e) =>
        e.type === 'step.started' || e.type === 'step.finished' ? `${e.type}:${e.stepId}` : e.type,
      ),
    ).toEqual([
      'run.started',
      'step.started:root',
      'step.started:a',
      'step.finished:a',
      'step.started:b',
      'step.finished:b',
      'step.finished:root',
      'run.finished',
    ]);
    // run.finished n'est diffusé qu'une fois tout enregistré.
    const summary = await t.http.get(`/api/runs/${run.id}`).expect(200);
    expect(summary.body.status).toBe('succeeded');
  });

  it('rejoue une Exécution terminée depuis la base', async () => {
    const { addRequest, addScenario } = await setup();
    const run = await launch(await addScenario([reqStep('a', await addRequest({}))]));
    await finished(run.id);

    const events = await readEvents(run.id);
    expect(events[0]?.type).toBe('run.started');
    expect(events.at(-1)).toMatchObject({ type: 'run.finished', status: 'succeeded' });
    expect(events.find((e) => e.type === 'step.finished' && e.stepId === 'a')).toMatchObject({
      result: { response: { status: 200 } },
    });
  });

  it('répond 404 pour une Exécution inconnue', async () => {
    await t.http.get('/api/runs/0123456789abcdef01234567/events').expect(404);
  });
});

describe('arrêt manuel', () => {
  it('arrête une Exécution en cours', async () => {
    const { addRequest, addScenario } = await setup();
    const scenarioId = await addScenario([
      { id: 'wait', type: 'pause', durationMs: 10_000 },
      reqStep('after', await addRequest({})),
    ]);
    const run = await launch(scenarioId);

    const started = Date.now();
    await t.http.post(`/api/runs/${run.id}/stop`).expect(202);
    const done = await finished(run.id);

    expect(Date.now() - started).toBeLessThan(3000);
    expect(done.status).toBe('stopped');
    expect(done.steps.find((s) => s.stepId === 'wait')?.status).toBe('stopped');
    expect(done.steps.find((s) => s.stepId === 'after')?.status).toBe('skipped');
    // Arrêter une Exécution terminée est sans effet.
    await t.http.post(`/api/runs/${run.id}/stop`).expect(202);
  });

  it('marque Arrêtées les Exécutions interrompues par un arrêt du serveur', async () => {
    const { cid } = await setup();
    await t.store.runs.create('local', {
      collectionId: cid,
      scenarioId: 'x',
      scenarioName: 'Orpheline',
      environmentName: null,
      snapshot: {} as never,
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 1000_000),
    });
    expect(await t.store.runs.markInterrupted(new Date())).toBe(1);
    const [run] = (await t.http.get('/api/runs').expect(200)).body as RunSummaryDto[];
    expect(run?.status).toBe('stopped');
  });
});

describe('historique', () => {
  it('liste les Exécutions, les plus récentes en premier, filtrées par Scénario', async () => {
    const { addRequest, addScenario } = await setup();
    const r = await addRequest({});
    const s1 = await addScenario([reqStep('a', r)], 'Un');
    const s2 = await addScenario([reqStep('a', r)], 'Deux');
    const first = await launch(s1);
    await t.runs.idle();
    const second = await launch(s1);
    await launch(s2);
    await t.runs.idle();

    const all = (await t.http.get('/api/runs').expect(200)).body as RunSummaryDto[];
    expect(all).toHaveLength(3);
    const onlyS1 = (await t.http.get(`/api/runs?scenarioId=${s1}`).expect(200))
      .body as RunSummaryDto[];
    expect(onlyS1.map((r) => r.id)).toEqual([second.id, first.id]);
    expect(onlyS1[0]?.stats?.requests.succeeded).toBe(1);
    await t.http.get('/api/runs?status=bogus').expect(422);
  });

  it('épingle une Exécution pour la soustraire à la purge', async () => {
    const { addRequest, addScenario } = await setup();
    const run = await launch(await addScenario([reqStep('a', await addRequest({}))]));
    await finished(run.id);
    const expiry = async (collection: string) =>
      (await t.connection.db!.collection(collection).find().toArray()).map((d) => d['expiresAt']);

    expect((await expiry('runs'))[0]).toBeInstanceOf(Date);
    const pinned = await t.http.patch(`/api/runs/${run.id}`).send({ pinned: true }).expect(200);
    expect(pinned.body.pinned).toBe(true);
    expect(await expiry('runs')).toEqual([undefined]);
    expect((await expiry('run_steps')).every((e) => e === undefined)).toBe(true);

    await t.http.patch(`/api/runs/${run.id}`).send({ pinned: false }).expect(200);
    expect((await expiry('runs'))[0]).toBeInstanceOf(Date);
  });

  it('tronque les corps de plus de 1 Mo', async () => {
    const { addRequest, addScenario } = await setup();
    const run = await launch(
      await addScenario([reqStep('big', await addRequest({ url: '{{base}}/big/1500' }))]),
    );
    const done = await finished(run.id);
    const response = done.steps[0]!.result!.response!;
    expect(response.bodyTruncated).toBe(true);
    expect(response.body.length).toBe(1_000_000);
  });

  it('supprime les Exécutions avec leur Collection', async () => {
    const { cid, addRequest, addScenario } = await setup();
    const run = await launch(await addScenario([reqStep('a', await addRequest({}))]));
    await finished(run.id);
    await t.http.delete(`/api/collections/${cid}`).expect(204);
    await t.http.get(`/api/runs/${run.id}`).expect(404);
    expect(await t.connection.db!.collection('run_steps').countDocuments()).toBe(0);
  });
});

describe('Envois', () => {
  it('envoie une Requête enregistrée, avec un Environnement', async () => {
    const { envId, addRequest } = await setup();
    const r = await addRequest({ url: '{{base}}/echo?who={{who}}' });

    const res = await t.http
      .post(`/api/requests/${r}/send`)
      .send({ environmentId: envId })
      .expect(200);
    const send = res.body as SendDto;
    expect(send).toMatchObject({ requestId: r, status: 'succeeded', environmentName: 'dev' });
    expect(JSON.parse(send.result.response!.body).query).toEqual({ who: 'from-env' });
  });

  it("envoie le brouillon de l'éditeur plutôt que la version enregistrée", async () => {
    const { addRequest } = await setup();
    const r = await addRequest({ url: '{{base}}/echo' });
    const res = await t.http
      .post(`/api/requests/${r}/send`)
      .send({ draft: { name: 'brouillon', method: 'GET', url: '{{base}}/status/418' } })
      .expect(200);
    expect(res.body.status).toBe('failed');
    expect(res.body.result.response.status).toBe(418);
    expect(target.callsTo('/echo')).toHaveLength(0);
  });

  it('masque les secrets et ne garde que les 20 derniers Envois', async () => {
    const { addRequest } = await setup();
    const r = await addRequest({ url: '{{base}}/echo?t={{token}}' });
    for (let i = 0; i < 22; i++) await t.http.post(`/api/requests/${r}/send`).send({}).expect(200);

    const list = (await t.http.get(`/api/requests/${r}/sends`).expect(200)).body as SendDto[];
    expect(list).toHaveLength(20);
    expect(list[0]!.at >= list[19]!.at).toBe(true);
    expect(JSON.stringify(list)).not.toContain(SECRET);
  });

  it('supprime les Envois avec leur Requête', async () => {
    const { addRequest } = await setup();
    const r = await addRequest({});
    await t.http.post(`/api/requests/${r}/send`).send({}).expect(200);
    await t.http.delete(`/api/requests/${r}`).expect(204);
    expect(await t.connection.db!.collection('sends').countDocuments()).toBe(0);
  });
});

describe('évaluation dans l’éditeur', () => {
  const response = {
    status: 201,
    statusText: 'Created',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 7, owner: SECRET, tags: ['a'] }),
    durationMs: 42,
  };

  it('évalue les Assertions comme le moteur, avec les Variables de l’Environnement', async () => {
    const { cid, envId } = await setup();
    const res = await t.http
      .post(`/api/collections/${cid}/evaluate`)
      .send({
        environmentId: envId,
        response,
        assertions: [
          { target: { type: 'status' }, operator: 'equals', expected: '201' },
          { target: { type: 'jsonPath', path: '$.tags' }, operator: 'contains', expected: 'b' },
          { target: { type: 'duration' }, operator: 'lt', expected: '{{missing}}' },
        ],
        extractions: [{ variable: 'id', source: { type: 'jsonPath', path: '$.id' } }],
      })
      .expect(200);

    expect(res.body.assertions.map((a: { passed: boolean }) => a.passed)).toEqual([
      true,
      false,
      false,
    ]);
    expect(res.body.assertions[1].actual).toEqual(['a']);
    expect(res.body.assertions[2].error).toEqual({ code: 'UNKNOWN_VARIABLE', detail: 'missing' });
    expect(res.body.extractions[0].value).toBe('7');
  });

  it('masque les valeurs secrètes dans le résultat', async () => {
    const { cid } = await setup();
    const res = await t.http
      .post(`/api/collections/${cid}/evaluate`)
      .send({
        response,
        assertions: [
          {
            target: { type: 'jsonPath', path: '$.owner' },
            operator: 'equals',
            expected: '{{token}}',
          },
        ],
      })
      .expect(200);
    expect(res.body.assertions[0].passed).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
  });

  it('refuse une réponse mal formée', async () => {
    const { cid } = await setup();
    await t.http
      .post(`/api/collections/${cid}/evaluate`)
      .send({ response: { status: 'x' } })
      .expect(422);
  });
});

describe('historique : pagination et filtres', () => {
  it('pagine par date de lancement et filtre les Exécutions épinglées', async () => {
    const { addRequest, addScenario } = await setup();
    const scenarioId = await addScenario([reqStep('a', await addRequest({}))]);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push((await launch(scenarioId)).id);
      await t.runs.idle();
    }
    const [newest, middle, oldest] = [...ids].reverse();

    const firstPage = (await t.http.get(`/api/runs?scenarioId=${scenarioId}&limit=2`).expect(200))
      .body as RunSummaryDto[];
    expect(firstPage.map((r) => r.id)).toEqual([newest, middle]);
    const next = (
      await t.http
        .get(
          `/api/runs?scenarioId=${scenarioId}&limit=2&before=${encodeURIComponent(firstPage[1]!.startedAt)}`,
        )
        .expect(200)
    ).body as RunSummaryDto[];
    expect(next.map((r) => r.id)).toEqual([oldest]);

    await t.http.patch(`/api/runs/${middle}`).send({ pinned: true }).expect(200);
    const pinned = (await t.http.get('/api/runs?pinned=true').expect(200)).body as RunSummaryDto[];
    expect(pinned.map((r) => r.id)).toEqual([middle]);
  });
});
