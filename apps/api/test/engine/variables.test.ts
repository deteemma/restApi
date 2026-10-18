import { describe, expect, it } from 'vitest';
import { StepErrorCode } from '@restapi/shared';
import { VariableError, VariableScope, interpolate } from '../../src/engine/variables';

const scope = (
  layers: Partial<Record<'collection' | 'environment' | 'parameters', Record<string, string>>> = {},
) =>
  VariableScope.root({
    collection: layers.collection ?? {},
    environment: layers.environment ?? {},
    parameters: layers.parameters ?? {},
  });

describe('ordre de priorité des Variables', () => {
  it('Environnement > Collection', () => {
    const s = scope({ collection: { v: 'col' }, environment: { v: 'env' } });
    expect(s.get('v')).toBe('env');
  });

  it('Paramètre de lancement > Environnement', () => {
    const s = scope({ environment: { v: 'env' }, parameters: { v: 'param' } });
    expect(s.get('v')).toBe('param');
  });

  it("Variable d'exécution > Paramètre de lancement", () => {
    const s = scope({ parameters: { v: 'param' } });
    s.set('v', 'run');
    expect(s.get('v')).toBe('run');
  });

  it("Surcharge > Variable d'exécution, sans modifier la portée d'origine", () => {
    const s = scope();
    s.set('v', 'run');
    const overridden = s.withOverrides({ v: 'override' });
    expect(overridden.get('v')).toBe('override');
    expect(s.get('v')).toBe('run');
  });

  it('renvoie undefined pour une Variable inconnue', () => {
    expect(scope().get('nope')).toBeUndefined();
  });
});

describe('portées séquentielles et parallèles', () => {
  it("une branche (fork) lit sa portée parente mais n'y écrit pas", () => {
    const parent = scope({ environment: { base: 'x' } });
    const branch = parent.fork();
    branch.set('id', '42');
    expect(branch.get('base')).toBe('x');
    expect(branch.get('id')).toBe('42');
    expect(parent.get('id')).toBeUndefined();
  });

  it("les écritures d'une branche deviennent visibles après fusion (fin du Groupe parallèle)", () => {
    const parent = scope();
    const a = parent.fork();
    const b = parent.fork();
    a.set('fromA', '1');
    b.set('fromB', '2');
    parent.merge([a, b]);
    expect(parent.get('fromA')).toBe('1');
    expect(parent.get('fromB')).toBe('2');
  });

  it('la fusion remonte aussi les écritures des sous-branches déjà fusionnées', () => {
    const parent = scope();
    const branch = parent.fork();
    const sub = branch.fork();
    sub.set('deep', 'yes');
    branch.merge([sub]);
    parent.merge([branch]);
    expect(parent.get('deep')).toBe('yes');
  });
});

describe('interpolate', () => {
  it('remplace les {{Variables}}, en tolérant les espaces', () => {
    const s = scope({ environment: { host: 'api.test', id: '7' } });
    expect(interpolate('https://{{host}}/items/{{ id }}', s)).toBe('https://api.test/items/7');
  });

  it('laisse intact un texte sans Variable', () => {
    expect(interpolate('{"a": 1}', scope())).toBe('{"a": 1}');
  });

  it('résout les Variables imbriquées dans les valeurs', () => {
    const s = scope({
      collection: { host: 'api.test' },
      environment: { baseUrl: 'https://{{host}}' },
    });
    expect(interpolate('{{baseUrl}}/x', s)).toBe('https://api.test/x');
  });

  it('signale toutes les Variables inconnues en une seule erreur', () => {
    try {
      interpolate('{{a}}/{{b}}/{{a}}', scope());
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(VariableError);
      expect((e as VariableError).code).toBe(StepErrorCode.UnknownVariable);
      expect((e as VariableError).names).toEqual(['a', 'b']);
    }
  });

  it('détecte une référence circulaire', () => {
    const s = scope({ environment: { a: '{{b}}', b: '{{a}}' } });
    expect(() => interpolate('{{a}}', s)).toThrow(
      expect.objectContaining({ code: StepErrorCode.CircularVariable }),
    );
  });
});
