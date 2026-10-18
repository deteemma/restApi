import { describe, expect, it } from 'vitest';
import { SECRET_MASK, type RequestStepResult } from '@restapi/shared';
import { createSanitizer } from '../../src/runs/sanitize';

const result = (partial: Partial<RequestStepResult> = {}): RequestStepResult => ({
  request: {
    method: 'POST',
    url: 'https://api.test/login?key=topsecret',
    headers: { Authorization: 'Basic dXNlcjpwd2Q=', 'X-Token': 'topsecret' },
    body: '{"password":"topsecret"}',
  },
  response: {
    status: 200,
    statusText: 'OK',
    headers: { 'set-cookie': 'sid=1' },
    body: '{"echo":"topsecret"}',
    durationMs: 10,
  },
  assertions: [
    {
      assertion: { target: { type: 'status' }, operator: 'equals', expected: '{{pwd}}' },
      passed: true,
      actual: 'topsecret',
      expected: 'topsecret',
    },
  ],
  extractions: [],
  ...partial,
});

describe('createSanitizer', () => {
  it('masque chaque occurrence des valeurs secrètes, partout', () => {
    const clean = createSanitizer(['topsecret']).result(result());
    expect(JSON.stringify(clean)).not.toContain('topsecret');
    expect(clean.request?.url).toBe(`https://api.test/login?key=${SECRET_MASK}`);
    expect(clean.response?.body).toBe(`{"echo":"${SECRET_MASK}"}`);
    expect(clean.assertions[0]?.actual).toBe(SECRET_MASK);
  });

  it('masque toujours les identifiants des en-têtes Authorization, quel que soit leur type', () => {
    const clean = createSanitizer([]).result(
      result({
        request: {
          method: 'GET',
          url: 'https://x',
          headers: { Authorization: 'Basic dXNlcjpwd2Q=', 'proxy-authorization': 'Bearer abc' },
        },
      }),
    );
    expect(clean.request?.headers).toEqual({
      Authorization: `Basic ${SECRET_MASK}`,
      'proxy-authorization': `Bearer ${SECRET_MASK}`,
    });
  });

  it('remplace aussi un secret qui en contient un autre (le plus long d’abord)', () => {
    const clean = createSanitizer(['abc', 'abcdef']).value('x abcdef y abc');
    expect(clean).toBe(`x ${SECRET_MASK} y ${SECRET_MASK}`);
  });

  it('ne masque un secret de moins de 3 caractères que lorsqu’il constitue toute la valeur', () => {
    const sanitize = createSanitizer(['42']);
    expect(sanitize.value({ id: '42', text: 'page 42' })).toEqual({
      id: SECRET_MASK,
      text: 'page 42',
    });
  });

  it('tronque les corps au-delà de la limite et le signale', () => {
    const big = 'x'.repeat(50);
    const clean = createSanitizer([], { maxBodyLength: 10 }).result(
      result({
        request: { method: 'POST', url: 'https://x', headers: {}, body: big },
        response: { status: 200, statusText: 'OK', headers: {}, body: big, durationMs: 1 },
      }),
    );
    expect(clean.request).toMatchObject({ body: 'x'.repeat(10), bodyTruncated: true });
    expect(clean.response).toMatchObject({ body: 'x'.repeat(10), bodyTruncated: true });
  });

  it("ne modifie pas l'objet d'origine", () => {
    const original = result();
    createSanitizer(['topsecret']).result(original);
    expect(original.request?.body).toContain('topsecret');
  });
});
