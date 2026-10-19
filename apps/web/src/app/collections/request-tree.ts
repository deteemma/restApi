import type { CollectionTree, FolderDto } from '@restapi/shared';

export type RequestSummary = CollectionTree['requests'][number];

export type TreeNode =
  | { kind: 'folder'; folder: FolderDto; children: TreeNode[] }
  | { kind: 'request'; request: RequestSummary };

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/**
 * Arborescence des Requêtes d'une Collection : à chaque niveau, les Dossiers puis les Requêtes,
 * par ordre alphabétique. Un Dossier ou une Requête dont le parent est introuvable va à la racine.
 */
export function buildRequestTree(tree: Pick<CollectionTree, 'folders' | 'requests'>): TreeNode[] {
  const folderIds = new Set(tree.folders.map((f) => f.id));
  const parentOf = (id: string | null) => (id && folderIds.has(id) ? id : null);

  const build = (parentId: string | null): TreeNode[] => [
    ...tree.folders
      .filter((f) => parentOf(f.parentId) === parentId && f.id !== parentId)
      .sort(byName)
      .map((folder): TreeNode => ({ kind: 'folder', folder, children: build(folder.id) })),
    ...tree.requests
      .filter((r) => parentOf(r.folderId) === parentId)
      .sort(byName)
      .map((request): TreeNode => ({ kind: 'request', request })),
  ];
  return build(null);
}
