import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { TestBed } from '@angular/core/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import { translocoTesting } from '../../../testing/transloco-testing';
import { WorkspaceStore } from '../../core/workspace.store';
import { EnvironmentSelector } from './environment-selector';

describe('EnvironmentSelector', () => {
  it('liste « Aucun Environnement » puis ceux de la Collection, et mémorise le choix', async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [EnvironmentSelector, translocoTesting()],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const store = TestBed.inject(WorkspaceStore);
    store.tree.set({
      collection: { id: 'c1', name: 'C' },
      folders: [],
      requests: [],
      scenarios: [],
      environments: [
        { id: 'e1', name: 'dev' },
        { id: 'e2', name: 'prod' },
      ],
    });
    const fixture = TestBed.createComponent(EnvironmentSelector);
    const select = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatSelectHarness);

    await select.open();
    const options = await select.getOptions();
    expect(await Promise.all(options.map((o) => o.getText()))).toEqual([
      'Aucun Environnement',
      'dev',
      'prod',
    ]);

    await options[2]!.click();
    expect(store.environmentId()).toBe('e2');
    expect(localStorage.getItem('restapi.environment.c1')).toBe('e2');
  });
});
