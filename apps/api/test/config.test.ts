import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  it("n'écoute qu'en local par défaut", () => {
    const config = loadConfig({});
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(3000);
    expect(config.apiKey).toBeUndefined();
  });

  it("lit l'hôte, le port et la clé d'API", () => {
    const config = loadConfig({ HOST: '0.0.0.0', PORT: '8080', API_KEY: 's3cret' });
    expect(config).toMatchObject({ host: '0.0.0.0', port: 8080, apiKey: 's3cret' });
  });

  it("ignore une clé d'API vide", () => {
    expect(loadConfig({ API_KEY: '  ' }).apiKey).toBeUndefined();
  });

  it('refuse un port invalide', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ PORT: '70000' })).toThrow(/PORT/);
  });
});
