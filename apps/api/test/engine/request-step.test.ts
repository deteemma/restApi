import { once } from 'node:events';
import net from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  StepErrorCode,
  type CollectionContext,
  type RequestBody,
  type RequestDefinition,
  type RequestStep,
} from '@restapi/shared';
import { executeRequestStep } from '../../src/engine/request-step';
import { VariableScope } from '../../src/engine/variables';
import { collection, req, reqStep } from '../support/builders';
import { TargetApi } from '../support/target-api';

let target: TargetApi;
let secureTarget: TargetApi;

beforeAll(async () => {
  [target, secureTarget] = await Promise.all([TargetApi.start(), TargetApi.start({ https: true })]);
});
afterAll(async () => {
  await Promise.all([target.close(), secureTarget.close()]);
});
beforeEach(() => target.reset());

interface Run {
  request?: RequestDefinition;
  step?: Partial<RequestStep>;
  collection?: Partial<CollectionContext>;
  variables?: Record<string, string>;
  scope?: VariableScope;
}

async function run({ request = req(), step, collection: col, variables, scope }: Run) {
  const ctx = collection({ ...col, variables: { base: target.url, ...col?.variables } });
  const s =
    scope ??
    VariableScope.root({ collection: ctx.variables, environment: variables ?? {}, parameters: {} });
  return executeRequestStep({ step: reqStep(request, step), request, collection: ctx, scope: s });
}

/** Un port sur lequel plus personne n'écoute. */
async function freePort(): Promise<number> {
  const server = net.createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as net.AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/** Corps de /echo, tel que l'API cible l'a reçu. */
const echoed = (outcome: Awaited<ReturnType<typeof run>>) =>
  JSON.parse(outcome.result.response!.body) as {
    method: string;
    query: Record<string, string>;
    headers: Record<string, string>;
    body: string;
  };

describe('construction de la requête', () => {
  it('résout les Variables dans l’URL, la query et les en-têtes', async () => {
    const outcome = await run({
      request: req({
        url: '{{base}}/echo',
        query: [
          { name: 'q', value: '{{term}}' },
          { name: 'off', value: 'x', enabled: false },
        ],
        headers: [
          { name: 'X-Tenant', value: '{{tenant}}' },
          { name: 'X-Off', value: 'x', enabled: false },
        ],
      }),
      variables: { term: 'a b', tenant: 'acme' },
    });

    expect(outcome.status).toBe('succeeded');
    expect(outcome.result.request?.url).toBe(`${target.url}/echo?q=a+b`);
    const body = echoed(outcome);
    expect(body.query).toEqual({ q: 'a b' });
    expect(body.headers['x-tenant']).toBe('acme');
    expect(body.headers['x-off']).toBeUndefined();
  });

  it.each([
    [{ type: 'json', content: '{"name":"{{who}}"}' }, 'application/json', '{"name":"Bob"}'],
    [{ type: 'text', content: 'hi {{who}}' }, 'text/plain', 'hi Bob'],
    [{ type: 'xml', content: '<who>{{who}}</who>' }, 'application/xml', '<who>Bob</who>'],
    [
      {
        type: 'form',
        fields: [
          { name: 'who', value: '{{who}}' },
          { name: 'n', value: '1 2' },
        ],
      },
      'application/x-www-form-urlencoded',
      'who=Bob&n=1+2',
    ],
  ] as const)('envoie un corps %o avec le bon Content-Type', async (body, contentType, sent) => {
    const outcome = await run({
      request: req({ method: 'POST', body: body as RequestBody }),
      variables: { who: 'Bob' },
    });
    expect(echoed(outcome).headers['content-type']).toContain(contentType);
    expect(echoed(outcome).body).toBe(sent);
    expect(outcome.result.request?.body).toBe(sent);
  });

  it('garde un Content-Type défini explicitement', async () => {
    const outcome = await run({
      request: req({
        method: 'POST',
        headers: [{ name: 'content-type', value: 'application/vnd.api+json' }],
        body: { type: 'json', content: '{}' },
      }),
    });
    expect(echoed(outcome).headers['content-type']).toBe('application/vnd.api+json');
  });

  it("n'envoie pas de corps pour GET et HEAD", async () => {
    const outcome = await run({ request: req({ body: { type: 'text', content: 'ignored' } }) });
    expect(outcome.status).toBe('succeeded');
    expect(echoed(outcome).body).toBe('');
  });
});

describe('authentification', () => {
  it.each([
    [{ type: 'basic', username: 'u', password: '{{pwd}}' }, 'authorization', 'Basic dTpzM2NyZXQ='],
    [{ type: 'bearer', token: '{{pwd}}' }, 'authorization', 'Bearer s3cret'],
    [{ type: 'apiKey', name: 'X-Key', value: '{{pwd}}', in: 'header' }, 'x-key', 's3cret'],
  ] as const)('%o', async (auth, header, value) => {
    const outcome = await run({ request: req({ auth }), variables: { pwd: 's3cret' } });
    expect(echoed(outcome).headers[header]).toBe(value);
  });

  it('place une clé API dans la query', async () => {
    const outcome = await run({
      request: req({ auth: { type: 'apiKey', name: 'key', value: 'k', in: 'query' } }),
    });
    expect(echoed(outcome).query).toEqual({ key: 'k' });
  });

  it("hérite de l'authentification de la Collection", async () => {
    const outcome = await run({
      request: req({ auth: { type: 'inherit' } }),
      collection: { auth: { type: 'bearer', token: 'col-token' } },
    });
    expect(echoed(outcome).headers['authorization']).toBe('Bearer col-token');
  });

  it("laisse un en-tête Authorization explicite prendre le pas sur l'authentification", async () => {
    const outcome = await run({
      request: req({
        auth: { type: 'bearer', token: 'auth' },
        headers: [{ name: 'Authorization', value: 'Custom explicit' }],
      }),
    });
    expect(echoed(outcome).headers['authorization']).toBe('Custom explicit');
  });
});

describe('Surcharges', () => {
  it('surcharge des Variables, des en-têtes (par nom, sans casse) et le corps', async () => {
    const outcome = await run({
      request: req({
        method: 'POST',
        headers: [
          { name: 'X-Mode', value: 'original' },
          { name: 'X-Keep', value: 'kept' },
        ],
        body: { type: 'text', content: 'original' },
      }),
      step: {
        overrides: {
          variables: { who: 'override' },
          headers: [
            { name: 'x-mode', value: '{{who}}' },
            { name: 'X-Added', value: 'added' },
          ],
          body: { type: 'text', content: 'new {{who}}' },
        },
      },
      variables: { who: 'env' },
    });
    const body = echoed(outcome);
    expect(body.headers['x-mode']).toBe('override');
    expect(body.headers['x-keep']).toBe('kept');
    expect(body.headers['x-added']).toBe('added');
    expect(body.body).toBe('new override');
  });
});

describe('réussite et échec', () => {
  it("échoue avec UNEXPECTED_STATUS hors 2xx quand il n'y a pas d'Assertion", async () => {
    const outcome = await run({ request: req({ url: '{{base}}/status/500' }) });
    expect(outcome.status).toBe('failed');
    expect(outcome.result.error).toEqual({ code: StepErrorCode.UnexpectedStatus });
    expect(outcome.result.response?.status).toBe(500);
  });

  it('remplace la règle 2xx par les Assertions quand il y en a', async () => {
    const outcome = await run({
      request: req({
        url: '{{base}}/status/404',
        assertions: [{ target: { type: 'status' }, operator: 'equals', expected: '404' }],
      }),
    });
    expect(outcome.status).toBe('succeeded');
  });

  it('échoue avec ASSERTION_FAILED et détaille chaque Assertion', async () => {
    const outcome = await run({
      request: req({
        assertions: [
          { target: { type: 'status' }, operator: 'equals', expected: '200' },
          { target: { type: 'jsonPath', path: '$.method' }, operator: 'equals', expected: 'POST' },
        ],
      }),
    });
    expect(outcome.status).toBe('failed');
    expect(outcome.result.error?.code).toBe(StepErrorCode.AssertionFailed);
    expect(outcome.result.assertions.map((a) => [a.passed, a.actual])).toEqual([
      [true, 200],
      [false, 'GET'],
    ]);
  });

  it('échoue avec UNKNOWN_VARIABLE sans rien envoyer', async () => {
    const outcome = await run({ request: req({ url: '{{base}}/echo/{{missing}}' }) });
    expect(outcome.status).toBe('failed');
    expect(outcome.result.error).toEqual({
      code: StepErrorCode.UnknownVariable,
      detail: 'missing',
    });
    expect(outcome.result.request).toBeUndefined();
    expect(target.calls).toHaveLength(0);
  });

  it('échoue avec REQUEST_NOT_FOUND pour une Étape orpheline', async () => {
    const outcome = await executeRequestStep({
      step: reqStep('deleted'),
      request: undefined,
      collection: collection(),
      scope: VariableScope.root({ collection: {}, environment: {}, parameters: {} }),
    });
    expect(outcome.status).toBe('failed');
    expect(outcome.result.error?.code).toBe(StepErrorCode.RequestNotFound);
  });

  it('échoue avec INVALID_URL', async () => {
    const outcome = await run({ request: req({ url: 'not a url' }) });
    expect(outcome.result.error?.code).toBe(StepErrorCode.InvalidUrl);
  });

  it('échoue avec TIMEOUT au-delà du délai maximal', async () => {
    const outcome = await run({
      request: req({ url: '{{base}}/delay/1000', settings: { timeoutMs: 100 } }),
    });
    expect(outcome.status).toBe('failed');
    expect(outcome.result.error?.code).toBe(StepErrorCode.Timeout);
  });

  it('échoue avec NETWORK quand la cible est injoignable', async () => {
    const outcome = await run({ request: req({ url: `http://127.0.0.1:${await freePort()}/x` }) });
    expect(outcome.status).toBe('failed');
    expect(outcome.result.error?.code).toBe(StepErrorCode.Network);
    expect(outcome.result.error?.detail).toBe('ECONNREFUSED');
  });
});

describe('réglages HTTP', () => {
  it('suit les redirections par défaut', async () => {
    const outcome = await run({ request: req({ url: '{{base}}/redirect' }) });
    expect(outcome.result.response?.status).toBe(200);
  });

  it('peut ne pas suivre les redirections', async () => {
    const outcome = await run({
      request: req({ url: '{{base}}/redirect', settings: { followRedirects: false } }),
    });
    expect(outcome.result.response?.status).toBe(302);
    expect(outcome.result.response?.headers['location']).toBe('/echo');
  });

  it('refuse un certificat TLS invalide par défaut', async () => {
    const outcome = await run({ request: req({ url: `${secureTarget.url}/text` }) });
    expect(outcome.result.error?.code).toBe(StepErrorCode.Network);
  });

  it('accepte un certificat invalide si on le demande (réglage de Collection)', async () => {
    const outcome = await run({
      request: req({ url: `${secureTarget.url}/text` }),
      collection: { settings: { timeoutMs: 5000, followRedirects: true, ignoreTlsErrors: true } },
    });
    expect(outcome.status).toBe('succeeded');
    expect(outcome.result.response?.body).toBe('hello');
  });
});

describe('réponse et Extractions', () => {
  it('rapporte le statut, les en-têtes (en minuscules), le corps et la durée', async () => {
    const outcome = await run({ request: req({ url: '{{base}}/headers?X-Custom=yes' }) });
    const response = outcome.result.response!;
    expect(response.status).toBe(200);
    expect(response.statusText).toBe('OK');
    expect(response.headers['x-custom']).toBe('yes');
    expect(response.durationMs).toBeGreaterThan(0);
  });

  it("range les valeurs extraites dans les Variables d'exécution", async () => {
    const scope = VariableScope.root({
      collection: { base: target.url },
      environment: {},
      parameters: {},
    });
    const outcome = await run({
      scope,
      request: req({
        method: 'POST',
        url: '{{base}}/items',
        body: { type: 'json', content: '{"name":"x"}' },
      }),
      step: {
        extractions: [
          { variable: 'itemId', source: { type: 'jsonPath', path: '$.id' } },
          { variable: 'createdStatus', source: { type: 'status' } },
        ],
      },
    });
    expect(outcome.status).toBe('succeeded');
    expect(scope.get('itemId')).toMatch(/^\d+$/);
    expect(scope.get('createdStatus')).toBe('201');
    expect(outcome.result.extractions.map((e) => e.value)).toEqual([scope.get('itemId'), '201']);
  });

  it('échoue avec EXTRACTION_FAILED quand une valeur à extraire est absente', async () => {
    const outcome = await run({
      step: { extractions: [{ variable: 'v', source: { type: 'jsonPath', path: '$.nope' } }] },
    });
    expect(outcome.status).toBe('failed');
    expect(outcome.result.error).toEqual({ code: StepErrorCode.ExtractionFailed, detail: 'v' });
  });
});
