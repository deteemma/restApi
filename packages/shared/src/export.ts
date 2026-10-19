/**
 * Format d'export d'une Collection (fichier JSON), versionné.
 *
 * Les éléments se référencent par des « refs » (les identifiants d'origine) : à l'import, chaque
 * élément reçoit un nouvel identifiant et les références sont remplacées. Les valeurs des
 * Variables secrètes ne sont jamais exportées.
 */
import type { CollectionAuth, GroupStep, HttpSettings, RequestDefinition } from './model';

export const EXPORT_FORMAT = 'restapi.collection';
export const EXPORT_SCHEMA_VERSION = 1;

/** Une Variable exportée : une Variable secrète n'a pas de valeur. */
export type ExportedVariable =
  { name: string; secret: false; value: string } | { name: string; secret: true };

export interface CollectionExport {
  format: typeof EXPORT_FORMAT;
  schemaVersion: typeof EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  collection: {
    name: string;
    variables: ExportedVariable[];
    auth: CollectionAuth;
    settings: HttpSettings;
  };
  folders: { ref: string; parentRef: string | null; name: string }[];
  requests: (Omit<RequestDefinition, 'id'> & { ref: string; folderRef: string | null })[];
  environments: { name: string; variables: ExportedVariable[] }[];
  /** Dans `root`, le `requestId` de chaque Étape-requête est la ref d'une Requête exportée. */
  scenarios: { name: string; root: GroupStep }[];
}
