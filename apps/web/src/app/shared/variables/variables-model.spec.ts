import { newRow, rowProblems, rowsFromViews, toInputs } from './variables-model';

describe('modèle de l’éditeur de Variables', () => {
  const rows = () =>
    rowsFromViews([
      { name: 'baseUrl', secret: false, value: 'https://api.test' },
      { name: 'token', secret: true, hasValue: true },
      { name: 'unset', secret: true, hasValue: false },
    ]);

  it('ne connaît jamais la valeur d’une Variable secrète', () => {
    expect(rows().map((r) => [r.name, r.value])).toEqual([
      ['baseUrl', 'https://api.test'],
      ['token', ''],
      ['unset', ''],
    ]);
  });

  it('renvoie une Variable secrète inchangée sans valeur, pour que le serveur la garde', () => {
    expect(toInputs(rows())).toEqual([
      { name: 'baseUrl', secret: false, value: 'https://api.test' },
      { name: 'token', secret: true },
      { name: 'unset', secret: true, value: '' },
    ]);
  });

  it('envoie la nouvelle valeur d’une Variable secrète ressaisie', () => {
    const r = rows();
    r[1]!.value = 'nouveau';
    expect(toInputs(r)[1]).toEqual({ name: 'token', secret: true, value: 'nouveau' });
  });

  it('signale les noms vides, invalides ou en double', () => {
    const r = [
      ...rows(),
      newRow(),
      { ...newRow(), name: 'avec espace' },
      { ...newRow(), name: 'baseUrl' },
    ];
    expect([...rowProblems(r).values()]).toEqual([
      'duplicate',
      'emptyName',
      'invalidName',
      'duplicate',
    ]);
  });

  it('exige de ressaisir la valeur d’une Variable secrète renommée', () => {
    const r = rows();
    r[1]!.name = 'accessToken';
    expect(rowProblems(r).get(r[1]!.key)).toBe('secretRenamed');
    r[1]!.value = 'ressaisi';
    expect(rowProblems(r).size).toBe(0);
    expect(toInputs(r)[1]).toEqual({ name: 'accessToken', secret: true, value: 'ressaisi' });
  });
});
