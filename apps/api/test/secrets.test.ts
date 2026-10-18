import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SecretBox } from '../src/secrets/secret-box';
import { resolveSecretKey } from '../src/secrets/secret-key';

describe('SecretBox', () => {
  const box = new SecretBox('une phrase secrète');

  it('chiffre puis déchiffre une valeur', () => {
    const sealed = box.seal('s3cret-token');
    expect(sealed).not.toContain('s3cret-token');
    expect(box.open(sealed)).toBe('s3cret-token');
  });

  it('produit un chiffré différent à chaque fois', () => {
    expect(box.seal('x')).not.toBe(box.seal('x'));
  });

  it('refuse un chiffré altéré ou une mauvaise clé', () => {
    const sealed = box.seal('valeur');
    const tampered = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'B' : 'A') + sealed.slice(-1);
    expect(() => box.open(tampered)).toThrow();
    expect(() => new SecretBox('autre clé').open(sealed)).toThrow();
  });
});

describe('resolveSecretKey', () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('prend SECRET_KEY quand elle est fournie', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'restapi-'));
    expect(resolveSecretKey({ secretKey: 'k', production: false, dataDir: dir })).toBe('k');
  });

  it('exige SECRET_KEY en production', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'restapi-'));
    expect(() => resolveSecretKey({ production: true, dataDir: dir })).toThrow(/SECRET_KEY/);
  });

  it('génère puis réutilise une clé locale en développement', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'restapi-'));
    const first = resolveSecretKey({ production: false, dataDir: dir });
    expect(first).toHaveLength(64);
    expect(readFileSync(path.join(dir, 'secret.key'), 'utf8').trim()).toBe(first);
    expect(resolveSecretKey({ production: false, dataDir: dir })).toBe(first);
  });
});
