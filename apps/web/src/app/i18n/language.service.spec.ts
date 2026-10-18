import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { translocoTesting } from '../../testing/transloco-testing';
import { LanguageService } from './language.service';

describe('LanguageService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [translocoTesting()] });
  });

  it('applique la langue mémorisée au démarrage', async () => {
    localStorage.setItem('restapi.lang', 'de');
    const service = TestBed.inject(LanguageService);

    await service.init();

    expect(service.current()).toBe('de');
    expect(TestBed.inject(TranslocoService).getActiveLang()).toBe('de');
    expect(TestBed.inject(DOCUMENT).documentElement.lang).toBe('de');
  });

  it('ne mémorise pas la langue choisie automatiquement au démarrage', async () => {
    await TestBed.inject(LanguageService).init();
    expect(localStorage.getItem('restapi.lang')).toBeNull();
  });

  it('change de langue et mémorise le choix explicite', async () => {
    const service = TestBed.inject(LanguageService);

    await service.choose('it');

    expect(service.current()).toBe('it');
    expect(TestBed.inject(TranslocoService).translate('home.title')).toBe('Benvenuto');
    expect(localStorage.getItem('restapi.lang')).toBe('it');
  });
});
