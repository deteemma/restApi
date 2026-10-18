import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { ErrorCode } from '@restapi/shared';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';

const appWith = (env: Record<string, string> = {}) => createApp(loadConfig(env));

describe('GET /api/health', () => {
  it("répond ok avec la version de l'API", async () => {
    const res = await request(appWith()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', version: expect.any(String) });
  });
});

describe('routes inconnues', () => {
  it('renvoie le code NOT_FOUND', async () => {
    const res = await request(appWith()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: ErrorCode.NotFound } });
  });
});

describe("clé d'API", () => {
  it("laisse tout passer quand aucune clé n'est configurée", async () => {
    const res = await request(appWith()).get('/api/nope');
    expect(res.status).toBe(404);
  });

  describe('quand API_KEY est configurée', () => {
    const app = appWith({ API_KEY: 's3cret' });

    it('refuse une requête sans en-tête X-API-Key', async () => {
      const res = await request(app).get('/api/nope');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: { code: ErrorCode.ApiKeyMissing } });
    });

    it('refuse une mauvaise clé', async () => {
      const res = await request(app).get('/api/nope').set('X-API-Key', 'wrong');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: { code: ErrorCode.ApiKeyInvalid } });
    });

    it('accepte la bonne clé', async () => {
      const res = await request(app).get('/api/nope').set('X-API-Key', 's3cret');
      expect(res.status).toBe(404);
    });

    it('laisse /api/health accessible sans clé', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
    });
  });
});
