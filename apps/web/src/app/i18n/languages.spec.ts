import { resolveInitialLanguage } from './languages';

describe('resolveInitialLanguage', () => {
  it('privilégie la langue mémorisée', () => {
    expect(resolveInitialLanguage('it', ['de-CH'])).toBe('it');
  });

  it('ignore une langue mémorisée non prise en charge', () => {
    expect(resolveInitialLanguage('es', ['de-CH'])).toBe('de');
  });

  it('prend la première langue du navigateur prise en charge, sans tenir compte de la région', () => {
    expect(resolveInitialLanguage(null, ['es-ES', 'IT-ch', 'en'])).toBe('it');
  });

  it('se replie sur le français', () => {
    expect(resolveInitialLanguage(null, ['es', 'pt-BR'])).toBe('fr');
    expect(resolveInitialLanguage(null, [])).toBe('fr');
  });
});
