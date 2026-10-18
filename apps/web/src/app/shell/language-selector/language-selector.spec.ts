import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed } from '@angular/core/testing';
import { MatMenuHarness } from '@angular/material/menu/testing';
import { translocoTesting } from '../../../testing/transloco-testing';
import { LanguageService } from '../../i18n/language.service';
import { LanguageSelector } from './language-selector';

describe('LanguageSelector', () => {
  beforeEach(async () => {
    // jsdom annonce un navigateur « en-US » : on fixe la langue de départ.
    localStorage.setItem('restapi.lang', 'fr');
    TestBed.configureTestingModule({ imports: [LanguageSelector, translocoTesting()] });
    await TestBed.inject(LanguageService).init();
  });

  async function setup() {
    const fixture = TestBed.createComponent(LanguageSelector);
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const menu = await loader.getHarness(MatMenuHarness);
    return { fixture, menu };
  }

  it('affiche la langue active sur le bouton', async () => {
    const { menu } = await setup();
    expect(await menu.getTriggerText()).toContain('fr');
  });

  it('propose les quatre langues, chacune nommée dans sa propre langue', async () => {
    const { menu } = await setup();
    await menu.open();
    const items = await menu.getItems();
    expect(await Promise.all(items.map((i) => i.getText()))).toEqual([
      expect.stringContaining('Français'),
      expect.stringContaining('English'),
      expect.stringContaining('Deutsch'),
      expect.stringContaining('Italiano'),
    ]);
  });

  it('change de langue au clic, sans rechargement', async () => {
    const { menu, fixture } = await setup();
    await menu.clickItem({ text: /Deutsch/ });
    await fixture.whenStable();

    expect(TestBed.inject(LanguageService).current()).toBe('de');
    expect(await menu.getTriggerText()).toContain('de');
    const trigger = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-label')).toBe('Sprache ändern');
  });
});
