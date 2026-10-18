import { describe, expect, it } from 'vitest';
import type {
  Assertion,
  AssertionOperator,
  AssertionTarget,
  ReceivedResponse,
} from '@restapi/shared';
import { evaluateAssertion, readTarget } from '../../src/engine/assertions';
import { runExtraction } from '../../src/engine/extractions';
import { VariableScope } from '../../src/engine/variables';

const response = (overrides: Partial<ReceivedResponse> = {}): ReceivedResponse => ({
  status: 201,
  statusText: 'Created',
  headers: { 'content-type': 'application/json', 'x-request-id': 'abc-123' },
  body: JSON.stringify({
    id: 42,
    name: 'Alice',
    active: true,
    manager: null,
    tags: ['vip', 'beta'],
    address: { city: 'Lausanne' },
    items: [{ sku: 'A' }, { sku: 'B' }],
  }),
  durationMs: 120,
  ...overrides,
});

const scope = VariableScope.root({
  collection: {},
  environment: { expectedName: 'Alice' },
  parameters: {},
});

const check = (
  target: AssertionTarget,
  operator: AssertionOperator,
  expected?: string,
  res = response(),
) => evaluateAssertion({ target, operator, expected } satisfies Assertion, res, scope);

const json = (path: string) => ({ type: 'jsonPath', path }) as const;

describe('readTarget', () => {
  it('lit le statut, la durée et un en-tête (sans tenir compte de la casse)', () => {
    expect(readTarget({ type: 'status' }, response())).toEqual({ found: true, value: 201 });
    expect(readTarget({ type: 'duration' }, response())).toEqual({ found: true, value: 120 });
    expect(readTarget({ type: 'header', name: 'X-Request-ID' }, response())).toEqual({
      found: true,
      value: 'abc-123',
    });
    expect(readTarget({ type: 'header', name: 'x-missing' }, response())).toEqual({ found: false });
  });

  it('lit une valeur unique, une liste de résultats, ou rien', () => {
    expect(readTarget(json('$.address.city'), response())).toEqual({
      found: true,
      value: 'Lausanne',
    });
    expect(readTarget(json('$.items[*].sku'), response())).toEqual({
      found: true,
      value: ['A', 'B'],
    });
    expect(readTarget(json('$.nope'), response())).toEqual({ found: false });
  });

  it("ne trouve rien si le corps n'est pas du JSON", () => {
    expect(readTarget(json('$.id'), response({ body: '<html/>' }))).toEqual({ found: false });
  });
});

describe('evaluateAssertion', () => {
  it.each([
    // [cible, opérateur, attendu, réussie ?]
    [{ type: 'status' }, 'equals', '201', true],
    [{ type: 'status' }, 'equals', '200', false],
    [{ type: 'status' }, 'notEquals', '200', true],
    [json('$.name'), 'equals', 'Alice', true],
    [json('$.active'), 'equals', 'true', true],
    [json('$.manager'), 'equals', 'null', true],
    [json('$.tags'), 'equals', '["vip","beta"]', true],
    [json('$.address'), 'equals', '{ "city": "Lausanne" }', true],
    [json('$.name'), 'contains', 'lic', true],
    [json('$.tags'), 'contains', 'vip', true],
    [json('$.tags'), 'contains', 'gold', false],
    [json('$.id'), 'exists', undefined, true],
    [json('$.nope'), 'exists', undefined, false],
    [json('$.nope'), 'notExists', undefined, true],
    [json('$.manager'), 'exists', undefined, true],
    [{ type: 'header', name: 'x-request-id' }, 'matches', '^abc-\\d+$', true],
    [json('$.name'), 'matches', '[invalid', false],
    [{ type: 'duration' }, 'lt', '500', true],
    [{ type: 'duration' }, 'lte', '120', true],
    [{ type: 'duration' }, 'gt', '120', false],
    [{ type: 'status' }, 'gte', '200', true],
    [json('$.name'), 'lt', '10', false],
    [json('$.id'), 'isType', 'number', true],
    [json('$.tags'), 'isType', 'array', true],
    [json('$.address'), 'isType', 'object', true],
    [json('$.manager'), 'isType', 'null', true],
    [json('$.name'), 'isType', 'number', false],
  ] as const)('%o %s %s → %s', (target, operator, expected, passed) => {
    expect(check(target, operator, expected).passed).toBe(passed);
  });

  it('échoue quand la valeur est absente, sauf pour notExists', () => {
    expect(check(json('$.nope'), 'equals', 'x').passed).toBe(false);
    expect(check(json('$.nope'), 'notEquals', 'x').passed).toBe(false);
  });

  it('résout les Variables dans la valeur attendue et la rapporte avec la valeur trouvée', () => {
    expect(check(json('$.name'), 'equals', '{{expectedName}}')).toEqual({
      assertion: { target: json('$.name'), operator: 'equals', expected: '{{expectedName}}' },
      passed: true,
      actual: 'Alice',
      expected: 'Alice',
    });
  });
});

describe('runExtraction', () => {
  it('extrait une valeur texte telle quelle, et les autres valeurs en JSON', () => {
    expect(runExtraction({ variable: 'v', source: json('$.name') }, response()).value).toBe(
      'Alice',
    );
    expect(runExtraction({ variable: 'v', source: json('$.id') }, response()).value).toBe('42');
    expect(runExtraction({ variable: 'v', source: json('$.tags') }, response()).value).toBe(
      '["vip","beta"]',
    );
    expect(runExtraction({ variable: 'v', source: { type: 'status' } }, response()).value).toBe(
      '201',
    );
    expect(
      runExtraction({ variable: 'v', source: { type: 'header', name: 'X-Request-Id' } }, response())
        .value,
    ).toBe('abc-123');
  });

  it("ne produit pas de valeur quand la source n'existe pas", () => {
    expect(
      runExtraction({ variable: 'v', source: json('$.nope') }, response()).value,
    ).toBeUndefined();
  });
});
