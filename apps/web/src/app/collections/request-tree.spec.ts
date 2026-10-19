import type { FolderDto } from '@restapi/shared';
import { buildRequestTree, moveTargets, type MoveTarget, type TreeNode } from './request-tree';

const folder = (id: string, name: string, parentId: string | null = null): FolderDto => ({
  id,
  name,
  parentId,
  collectionId: 'c',
});
const request = (id: string, name: string, folderId: string | null = null) => ({
  id,
  name,
  method: 'GET' as const,
  folderId,
});

/** Représentation compacte : noms, avec les enfants des Dossiers entre crochets. */
const shape = (nodes: TreeNode[]): unknown[] =>
  nodes.map((n) => (n.kind === 'folder' ? { [n.folder.name]: shape(n.children) } : n.request.name));

describe('buildRequestTree', () => {
  it('place les Dossiers avant les Requêtes, par ordre alphabétique à chaque niveau', () => {
    const tree = buildRequestTree({
      folders: [folder('f2', 'zones'), folder('f1', 'Clients'), folder('f3', 'archives', 'f1')],
      requests: [
        request('r1', 'Lister'),
        request('r2', 'créer', 'f1'),
        request('r3', 'Ancien', 'f3'),
        request('r4', 'Accueil'),
      ],
    });
    expect(shape(tree)).toEqual([
      { Clients: [{ archives: ['Ancien'] }, 'créer'] },
      { zones: [] },
      'Accueil',
      'Lister',
    ]);
  });

  it('rattache à la racine ce dont le parent est introuvable', () => {
    const tree = buildRequestTree({
      folders: [folder('f1', 'Perdu', 'missing')],
      requests: [request('r1', 'Seule', 'missing')],
    });
    expect(shape(tree)).toEqual([{ Perdu: [] }, 'Seule']);
  });
});

describe('moveTargets', () => {
  const folders = [
    folder('f1', 'Clients'),
    folder('f2', 'Archives', 'f1'),
    folder('f3', 'Vieux', 'f2'),
    folder('f4', 'Zones'),
  ];
  const paths = (targets: MoveTarget[]) => targets.map((t) => t.path.join(' / '));

  it("propose pour une Requête la racine et chaque Dossier, sauf celui qui la contient, dans l'ordre de l'arborescence", () => {
    const targets = moveTargets(
      { folders, requests: [request('r1', 'Lister', 'f2')] },
      { kind: 'request', id: 'r1' },
    );
    expect(paths(targets)).toEqual(['', 'Clients', 'Clients / Archives / Vieux', 'Zones']);
    expect(targets.map((t) => t.folderId)).toEqual([null, 'f1', 'f3', 'f4']);
  });

  it('exclut pour un Dossier son parent, lui-même et ses descendants', () => {
    const targets = moveTargets({ folders, requests: [] }, { kind: 'folder', id: 'f2' });
    expect(paths(targets)).toEqual(['', 'Zones']);
  });

  it('ne propose pas la racine à un Dossier qui y est déjà', () => {
    const targets = moveTargets({ folders, requests: [] }, { kind: 'folder', id: 'f4' });
    expect(paths(targets)).toEqual(['Clients', 'Clients / Archives', 'Clients / Archives / Vieux']);
  });
});
