/**
 * Objets échangés avec l'API de gestion (L2). Les identifiants sont des chaînes.
 */
import type {
  CollectionAuth,
  GroupStep,
  HttpMethod,
  HttpSettings,
  RequestDefinition,
  Scenario,
} from './model';

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

/**
 * Une Variable telle que l'API la renvoie. La valeur d'une Variable secrète
 * n'est jamais renvoyée : on indique seulement qu'elle existe.
 */
export type VariableView =
  | { name: string; secret: false; value: string }
  | { name: string; secret: true; hasValue: boolean };

/**
 * Une Variable telle qu'on l'envoie à l'API. Si `value` est absente, la valeur
 * déjà enregistrée sous ce nom est conservée (c'est ainsi qu'on renvoie une
 * Variable secrète sans la connaître).
 */
export interface VariableInput {
  name: string;
  secret?: boolean;
  value?: string;
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export interface CollectionDto {
  id: string;
  name: string;
  variables: VariableView[];
  auth: CollectionAuth;
  settings: HttpSettings;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionInput {
  name: string;
  variables?: VariableInput[];
  auth?: CollectionAuth;
  settings?: Partial<HttpSettings>;
}

export type CollectionPatch = Partial<CollectionInput>;

/** Tout ce qu'affiche l'arborescence d'une Collection. */
export interface CollectionTree {
  collection: { id: string; name: string };
  folders: FolderDto[];
  requests: { id: string; name: string; method: HttpMethod; folderId: string | null }[];
  scenarios: { id: string; name: string }[];
  environments: { id: string; name: string }[];
}

// ---------------------------------------------------------------------------
// Dossiers, Requêtes, Environnements, Scénarios
// ---------------------------------------------------------------------------

export interface FolderDto {
  id: string;
  collectionId: string;
  /** Null : Dossier à la racine de la Collection. */
  parentId: string | null;
  name: string;
}

export interface FolderInput {
  name: string;
  parentId?: string | null;
}

export interface RequestDto extends RequestDefinition {
  collectionId: string;
  folderId: string | null;
}

export type RequestInput = Omit<RequestDefinition, 'id'> & { folderId?: string | null };

export interface EnvironmentDto {
  id: string;
  collectionId: string;
  name: string;
  variables: VariableView[];
}

export interface EnvironmentInput {
  name: string;
  variables?: VariableInput[];
}

export interface ScenarioDto extends Scenario {
  collectionId: string;
}

export interface ScenarioInput {
  name: string;
  root: GroupStep;
}

/** Détail de l'erreur REQUEST_IN_USE. */
export interface RequestInUseDetails {
  scenarios: { id: string; name: string }[];
}
