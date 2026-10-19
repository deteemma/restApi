import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ErrorCode, type CollectionTree as Tree } from '@restapi/shared';
import { translocoTesting } from '../../../testing/transloco-testing';
import { WorkspaceStore } from '../../core/workspace.store';
import { Dialogs } from '../../shared/ui/dialogs';
import { CollectionTree } from './collection-tree';

const tree: Tree = {
  collection: { id: 'c1', name: 'Boutique' },
  folders: [{ id: 'f1', collectionId: 'c1', parentId: null, name: 'Clients' }],
  requests: [
    { id: 'r1', name: 'Créer', method: 'POST', folderId: 'f1' },
    { id: 'r2', name: 'Santé', method: 'GET', folderId: null },
  ],
  scenarios: [{ id: 's1', name: 'Parcours' }],
  environments: [{ id: 'e1', name: 'dev' }],
};

/** Accès à la méthode protégée qui supprime un élément (après confirmation). */
type Removable = { remove(kind: string, id: string, name: string): Promise<void> };

describe('CollectionTree', () => {
  let store: WorkspaceStore;
  const dialogs = { askName: vi.fn(), confirm: vi.fn() };

  async function setup() {
    TestBed.configureTestingModule({
      imports: [CollectionTree, translocoTesting()],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Dialogs, useValue: dialogs },
      ],
    });
    store = TestBed.inject(WorkspaceStore);
    store.tree.set(tree);
    const fixture = TestBed.createComponent(CollectionTree);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    dialogs.askName.mockReset();
    dialogs.confirm.mockReset();
  });

  it('affiche les Dossiers, les Requêtes avec leur méthode, les Scénarios et les Environnements', async () => {
    const { el } = await setup();
    const label = (e: Element) => e.querySelector('.label')?.textContent?.trim();
    const requests = [...el.querySelectorAll('a')]
      .filter((a) => a.querySelector('app-method-badge'))
      .map((a) => [a.querySelector('app-method-badge')!.textContent!.trim(), label(a)]);
    expect(requests).toEqual([
      ['POST', 'Créer'],
      ['GET', 'Santé'],
    ]);
    expect(label(el.querySelector('.toggle')!)).toBe('Clients');
    expect(el.textContent).toContain('Parcours');
    expect(el.textContent).toContain('dev');
  });

  it('replie et déplie un Dossier', async () => {
    const { el, fixture } = await setup();
    const toggle = el.querySelector<HTMLButtonElement>('.toggle')!;
    toggle.click();
    await fixture.whenStable();
    expect(el.textContent).not.toContain('Créer');
    toggle.click();
    await fixture.whenStable();
    expect(el.textContent).toContain('Créer');
  });

  it('propose de forcer la suppression d’une Requête utilisée, en listant les Scénarios', async () => {
    const { fixture } = await setup();
    const inUse = new HttpErrorResponse({
      status: 409,
      error: {
        error: {
          code: ErrorCode.RequestInUse,
          details: { scenarios: [{ id: 's1', name: 'Parcours' }] },
        },
      },
    });
    const deleteRequest = vi
      .spyOn(store, 'deleteRequest')
      .mockRejectedValueOnce(inUse)
      .mockResolvedValueOnce(undefined);
    dialogs.confirm.mockResolvedValue(true);

    await (fixture.componentInstance as unknown as Removable).remove('request', 'r1', 'Créer');

    expect(dialogs.confirm).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'dialogs.requestInUseTitle', items: ['Parcours'] }),
    );
    expect(deleteRequest.mock.calls).toEqual([['r1'], ['r1', { force: true }]]);
  });

  it("ne supprime rien si l'utilisateur annule", async () => {
    const { fixture } = await setup();
    const deleteScenario = vi.spyOn(store, 'deleteScenario');
    dialogs.confirm.mockResolvedValue(false);
    await (fixture.componentInstance as unknown as Removable).remove('scenario', 's1', 'Parcours');
    expect(deleteScenario).not.toHaveBeenCalled();
  });
});
