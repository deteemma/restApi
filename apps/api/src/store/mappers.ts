import type {
  CollectionAuth,
  CollectionDto,
  EnvironmentDto,
  FolderDto,
  GroupStep,
  HttpMethod,
  HttpSettings,
  RequestDefinition,
  RequestDto,
  ScenarioDto,
  Step,
} from '@restapi/shared';
import type { CollectionDoc, EnvironmentDoc, FolderDoc, RequestDoc, ScenarioDoc } from './models';
import { toView } from './variables';

// ---------------------------------------------------------------------------
// Conversions document → objet de l'API
// ---------------------------------------------------------------------------

export function collectionDto(doc: CollectionDoc): CollectionDto {
  return {
    id: String(doc._id),
    name: doc.name,
    variables: doc.variables.map(toView),
    auth: doc.auth as CollectionAuth,
    settings: doc.settings as HttpSettings,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function folderDto(doc: FolderDoc): FolderDto {
  return {
    id: String(doc._id),
    collectionId: String(doc.collectionId),
    parentId: doc.parentId ? String(doc.parentId) : null,
    name: doc.name,
  };
}

export function requestDefinition(doc: RequestDoc): RequestDefinition {
  return {
    id: String(doc._id),
    name: doc.name,
    method: doc.method as HttpMethod,
    url: doc.url,
    query: doc.query,
    headers: doc.headers,
    body: doc.body,
    auth: doc.auth,
    assertions: doc.assertions,
    ...(doc.settings ? { settings: doc.settings } : {}),
  };
}

export function requestDto(doc: RequestDoc): RequestDto {
  return {
    ...requestDefinition(doc),
    collectionId: String(doc.collectionId),
    folderId: doc.folderId ? String(doc.folderId) : null,
  };
}

export function environmentDto(doc: EnvironmentDoc): EnvironmentDto {
  return {
    id: String(doc._id),
    collectionId: String(doc.collectionId),
    name: doc.name,
    variables: doc.variables.map(toView),
  };
}

export function scenarioDto(doc: ScenarioDoc): ScenarioDto {
  return {
    id: String(doc._id),
    collectionId: String(doc.collectionId),
    name: doc.name,
    root: doc.root as GroupStep,
  };
}

export function referencedRequestIds(root: GroupStep): string[] {
  const ids = new Set<string>();
  const visit = (step: Step) => {
    if (step.type === 'request') ids.add(step.requestId);
    if (step.type === 'group') step.steps.forEach(visit);
  };
  visit(root);
  return [...ids];
}
