import { formatDuration } from './duration';

describe('formatDuration', () => {
  it('affiche les millisecondes, les secondes au format de la langue, puis les minutes', () => {
    expect(formatDuration(375.4, 'fr')).toBe('375 ms');
    expect(formatDuration(2430, 'fr')).toBe('2,4 s');
    expect(formatDuration(2430, 'en')).toBe('2.4 s');
    expect(formatDuration(185_000, 'de')).toBe('3 min 05 s');
  });
});
