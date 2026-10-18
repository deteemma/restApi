import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { StepErrorCode, type RequestDefinition, type RunEvent } from '@restapi/shared';
import { runScenario } from '../../src/engine/run-scenario';
import { par, pause, req, reqStep, seq, snapshot } from '../support/builders';
import { TargetApi } from '../support/target-api';

let target: TargetApi;
beforeAll(async () => {
  target = await TargetApi.start();
});
afterAll(() => target.close());
beforeEach(() => target.reset());

const delay = (ms: number, id?: string) => req({ id, url: `{{base}}/delay/${ms}` });
const failing = (id?: string) => req({ id, url: '{{base}}/status/500' });
const createItem = req({
  method: 'POST',
  url: '{{base}}/items',
  body: { type: 'json', content: '{"name":"{{name}}"}' },
});
const readItem = req({ url: '{{base}}/items/{{itemId}}' });
const extractId = [{ variable: 'itemId', source: { type: 'jsonPath' as const, path: '$.id' } }];

async function run(
  root: ReturnType<typeof seq>,
  requests: RequestDefinition[],
  options: { signal?: AbortSignal; parameters?: Record<string, string> } = {},
) {
  const events: RunEvent[] = [];
  const result = await runScenario(
    snapshot(target.url, root, requests, {
      parameters: options.parameters ?? {},
      environment: { name: 'test', variables: { name: 'from-env' } },
    }),
    { signal: options.signal, onEvent: (e) => events.push(e) },
  );
  const finished = (stepId: string) =>
    events.find((e) => e.type === 'step.finished' && e.stepId === stepId) as
      Extract<RunEvent, { type: 'step.finished' }> | undefined;
  return { result, events, status: (stepId: string) => finished(stepId)?.status, finished };
}

describe('Groupe séquentiel', () => {
  it("exécute les Étapes dans l'ordre, l'une après l'autre", async () => {
    const r = [delay(30), delay(30), delay(30)];
    const root = seq(r.map((x) => reqStep(x)));
    const { result } = await run(root, r);

    expect(result.status).toBe('succeeded');
    const calls = target.calls;
    expect(calls).toHaveLength(3);
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i]!.startedAt).toBeGreaterThanOrEqual(calls[i - 1]!.endedAt!);
    }
  });

  it('émet run.started, un started/finished par Étape, puis run.finished', async () => {
    const a = req();
    const step = reqStep(a);
    const root = seq([step]);
    const { events } = await run(root, [a]);

    expect(events.map((e) => [e.type, 'stepId' in e ? e.stepId : undefined])).toEqual([
      ['run.started', undefined],
      ['step.started', root.id],
      ['step.started', step.id],
      ['step.finished', step.id],
      ['step.finished', root.id],
      ['run.finished', undefined],
    ]);
    const finishedStep = events[3] as Extract<RunEvent, { type: 'step.finished' }>;
    expect(finishedStep.result?.response?.status).toBe(200);
  });

  it('enchaîne les données : une Extraction est visible des Étapes suivantes', async () => {
    const root = seq([reqStep(createItem, { extractions: extractId }), reqStep(readItem)]);
    const { result } = await run(root, [createItem, readItem]);

    expect(result.status).toBe('succeeded');
    expect(result.variables['itemId']).toMatch(/^\d+$/);
    expect(target.callsTo(`/items/${result.variables['itemId']}`)).toHaveLength(1);
  });

  it('utilise les Paramètres de lancement et l’Environnement', async () => {
    const root = seq([reqStep(createItem, { id: 'create' })]);
    const withEnv = await run(root, [createItem]);
    expect(JSON.parse(withEnv.finished('create')!.result!.response!.body).name).toBe('from-env');

    const withParam = await run(root, [createItem], { parameters: { name: 'from-param' } });
    expect(JSON.parse(withParam.finished('create')!.result!.response!.body).name).toBe(
      'from-param',
    );
  });

  it('Arrêt au premier échec : les Étapes suivantes sont Ignorées et le Groupe échoue', async () => {
    const ok = req();
    const ko = failing();
    const after = req({ url: '{{base}}/text' });
    const s = [reqStep(ok), reqStep(ko), reqStep(after)];
    const root = seq(s);
    const { result, status } = await run(root, [ok, ko, after]);

    expect([status(s[0]!.id), status(s[1]!.id), status(s[2]!.id)]).toEqual([
      'succeeded',
      'failed',
      'skipped',
    ]);
    expect(status(root.id)).toBe('failed');
    expect(result.status).toBe('failed');
    expect(target.callsTo('/text')).toHaveLength(0);
  });

  it('sans Arrêt au premier échec, continue mais finit en échec', async () => {
    const ko = failing();
    const after = req({ url: '{{base}}/text' });
    const s = [reqStep(ko), reqStep(after)];
    const root = seq(s, { stopOnFailure: false });
    const { result, status } = await run(root, [ko, after]);

    expect(status(s[1]!.id)).toBe('succeeded');
    expect(result.status).toBe('failed');
  });

  it("fait remonter l'échec au parent, qui Ignore toute la suite, descendants compris", async () => {
    const ko = failing();
    const a = req();
    const inner = seq([reqStep(ko)]);
    const laterLeaf = reqStep(a);
    const laterGroup = par([laterLeaf]);
    const root = seq([inner, laterGroup]);
    const { status, events } = await run(root, [ko, a]);

    expect(status(inner.id)).toBe('failed');
    expect(status(laterGroup.id)).toBe('skipped');
    expect(status(laterLeaf.id)).toBe('skipped');
    // Une Étape Ignorée n'a jamais démarré.
    expect(events.some((e) => e.type === 'step.started' && e.stepId === laterLeaf.id)).toBe(false);
  });

  it('fait échouer une Étape orpheline avec REQUEST_NOT_FOUND', async () => {
    const orphan = reqStep('deleted-request');
    const { finished, result } = await run(seq([orphan]), []);
    expect(finished(orphan.id)?.result?.error?.code).toBe(StepErrorCode.RequestNotFound);
    expect(result.status).toBe('failed');
  });
});

describe('Groupe parallèle', () => {
  it('exécute les Étapes en même temps', async () => {
    const r = Array.from({ length: 5 }, () => delay(150));
    const started = performance.now();
    const { result } = await run(seq([par(r.map((x) => reqStep(x)))]), r);

    expect(result.status).toBe('succeeded');
    expect(target.maxInFlight).toBe(5);
    expect(performance.now() - started).toBeLessThan(600);
  });

  it('respecte la concurrence maximale', async () => {
    const r = Array.from({ length: 5 }, () => delay(40));
    await run(
      seq([
        par(
          r.map((x) => reqStep(x)),
          { maxConcurrency: 2 },
        ),
      ]),
      r,
    );
    expect(target.calls).toHaveLength(5);
    expect(target.maxInFlight).toBe(2);
  });

  it('limite la concurrence à 10 par défaut', async () => {
    const r = Array.from({ length: 12 }, () => delay(60));
    await run(seq([par(r.map((x) => reqStep(x)))]), r);
    expect(target.maxInFlight).toBe(10);
  });

  it("Arrêt au premier échec : les Étapes sœurs déjà lancées vont jusqu'au bout", async () => {
    const ko = failing();
    const slow = delay(150);
    const s = [reqStep(ko), reqStep(slow)];
    const group = par(s);
    const { status } = await run(seq([group]), [ko, slow]);

    expect(status(s[1]!.id)).toBe('succeeded');
    expect(status(group.id)).toBe('failed');
  });

  it('Arrêt au premier échec : les Étapes pas encore lancées sont Ignorées', async () => {
    const ko = failing();
    const a = req();
    const b = req();
    const s = [reqStep(ko), reqStep(a), reqStep(b)];
    const group = par(s, { maxConcurrency: 1 });
    const { status } = await run(seq([group]), [ko, a, b]);

    expect(s.map((x) => status(x.id))).toEqual(['failed', 'skipped', 'skipped']);
    expect(target.callsTo('/echo')).toHaveLength(0);
  });

  it("une Extraction n'est visible qu'une fois le Groupe parallèle terminé", async () => {
    const sibling = reqStep(readItem);
    const after = reqStep(readItem);
    const root = seq([par([reqStep(createItem, { extractions: extractId }), sibling]), after]);
    const { finished, status } = await run(root, [createItem, readItem]);

    expect(finished(sibling.id)?.result?.error?.code).toBe(StepErrorCode.UnknownVariable);
    // La racine s'arrête au premier échec : on vérifie la visibilité dans un second Scénario.
    expect(status(after.id)).toBe('skipped');

    const afterGroup = seq([
      par([reqStep(createItem, { extractions: extractId })]),
      reqStep(readItem, { id: 'later' }),
    ]);
    const second = await run(afterGroup, [createItem, readItem]);
    expect(second.status('later')).toBe('succeeded');
  });

  it("dans une branche séquentielle d'un Groupe parallèle, l'enchaînement fonctionne", async () => {
    const branch = seq([reqStep(createItem, { extractions: extractId }), reqStep(readItem)]);
    const other = delay(20);
    const { result } = await run(seq([par([branch, reqStep(other)])]), [
      createItem,
      readItem,
      other,
    ]);
    expect(result.status).toBe('succeeded');
  });
});

describe('Pause', () => {
  it('attend la durée indiquée avant la suite', async () => {
    const a = req();
    const b = req({ url: '{{base}}/text' });
    const p = pause(120);
    const { status } = await run(seq([reqStep(a), p, reqStep(b)]), [a, b]);

    expect(status(p.id)).toBe('succeeded');
    const [first, second] = target.calls;
    expect(second!.startedAt - first!.endedAt!).toBeGreaterThanOrEqual(110);
  });
});

describe('arrêt manuel', () => {
  it('interrompt une Pause en cours (Arrêtée) et Ignore la suite', async () => {
    const a = req();
    const b = req({ url: '{{base}}/text' });
    const p = pause(10_000);
    const last = reqStep(b);
    const root = seq([reqStep(a), p, last]);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);

    const started = performance.now();
    const { result, status } = await run(root, [a, b], { signal: controller.signal });

    expect(performance.now() - started).toBeLessThan(2000);
    expect(status(p.id)).toBe('stopped');
    expect(status(last.id)).toBe('skipped');
    expect(status(root.id)).toBe('stopped');
    expect(result.status).toBe('stopped');
  });

  it('laisse finir une requête déjà partie', async () => {
    const slow = delay(200);
    const b = req({ url: '{{base}}/text' });
    const s = [reqStep(slow), reqStep(b)];
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);

    const { result, status } = await run(seq(s), [slow, b], { signal: controller.signal });

    expect(status(s[0]!.id)).toBe('succeeded');
    expect(status(s[1]!.id)).toBe('skipped');
    expect(result.status).toBe('stopped');
  });

  it("n'exécute rien si l'arrêt précède le lancement", async () => {
    const a = req();
    const root = seq([reqStep(a)]);
    const { result, status } = await run(root, [a], { signal: AbortSignal.abort() });

    expect(status(root.id)).toBe('skipped');
    expect(result.status).toBe('stopped');
    expect(target.calls).toHaveLength(0);
  });

  it("ne change rien si l'arrêt arrive une fois tout terminé", async () => {
    const a = req();
    const controller = new AbortController();
    const { result } = await run(seq([reqStep(a)]), [a], { signal: controller.signal });
    controller.abort();
    expect(result.status).toBe('succeeded');
  });
});

describe('résultat', () => {
  it('donne le statut final de chaque Étape et un unique step.finished par Étape', async () => {
    const a = req();
    const ko = failing();
    const s = [reqStep(a), reqStep(ko), reqStep(a)];
    const root = seq([par(s.slice(0, 2), { stopOnFailure: false }), s[2]!]);
    const { result, events } = await run(root, [a, ko]);

    const finishedIds = events.filter((e) => e.type === 'step.finished').map((e) => e.stepId);
    expect(new Set(finishedIds).size).toBe(finishedIds.length);
    expect(result.steps[s[0]!.id]?.status).toBe('succeeded');
    expect(result.steps[s[1]!.id]?.status).toBe('failed');
    expect(result.steps[s[2]!.id]?.status).toBe('skipped');
    expect(result.steps[root.id]?.status).toBe('failed');
  });
});
