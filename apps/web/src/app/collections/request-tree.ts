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

/** Un élément de l'arborescence des Requêtes que l'on peut déplacer. */
export interface MovableItem {
  kind: 'folder' | 'request';
  id: string;
}

/** Une destination de déplacement : un Dossier (`null` pour la racine) et son chemin de noms. */
export interface MoveTarget {
  folderId: string | null;
  path: string[];
}

/**
 * Destinations possibles pour déplacer un Dossier ou une Requête, dans l'ordre de l'arborescence :
 * la racine puis chaque Dossier, sauf le parent actuel. Un Dossier ne peut aller ni dans lui-même
 * ni dans l'un de ses descendants.
 */
export function moveTargets(
  tree: Pick<CollectionTree, 'folders' | 'requests'>,
  item: MovableItem,
): MoveTarget[] {
  const nodes = buildRequestTree(tree);
  const currentParent = findParentId(nodes, item, null);
  const targets: MoveTarget[] = [{ folderId: null, path: [] }];
  const walk = (branch: TreeNode[], path: string[]) => {
    for (const node of branch) {
      if (node.kind !== 'folder') continue;
      if (item.kind === 'folder' && node.folder.id === item.id) continue;
      const folderPath = [...path, node.folder.name];
      targets.push({ folderId: node.folder.id, path: folderPath });
      walk(node.children, folderPath);
    }
  };
  walk(nodes, []);
  return targets.filter((t) => t.folderId !== currentParent);
}

/** Dossier qui contient l'élément tel qu'il est affiché (`null` : la racine, `undefined` : introuvable). */
function findParentId(
  nodes: TreeNode[],
  item: MovableItem,
  parentId: string | null,
): string | null | undefined {
  for (const node of nodes) {
    if (node.kind === 'request') {
      if (item.kind === 'request' && node.request.id === item.id) return parentId;
      continue;
    }
    if (item.kind === 'folder' && node.folder.id === item.id) return parentId;
    const found = findParentId(node.children, item, node.folder.id);
    if (found !== undefined) return found;
  }
  return undefined;
}
