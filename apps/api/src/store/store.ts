import { Types, type Connection } from 'mongoose';
import {
  DEFAULT_HTTP_SETTINGS,
  ErrorCode,
  type CollectionAuth,
  type CollectionDto,
  type CollectionInput,
  type CollectionPatch,
  type CollectionTree,
  type EnvironmentDto,
  type EnvironmentInput,
  type FolderDto,
  type FolderInput,
  type GroupStep,
  type HttpMethod,
  type HttpSettings,
  type RequestDefinition,
  type RequestDto,
  type RequestInUseDetails,
  type RequestInput,
  type RunSnapshot,
  type ScenarioDto,
  type ScenarioInput,
  type ScenarioIssue,
  type Step,
} from '@restapi/shared';
import { validateScenario } from '../engine';
import { DomainError, invalid, notFound } from '../errors';
import type { SecretBox } from '../secrets/secret-box';
import {
  registerModels,
  type CollectionDoc,
  type EnvironmentDoc,
  type FolderDoc,
  type RequestDoc,
  type ScenarioDoc,
} from './models';
import { isObjectId, toObjectId } from './ids';
import { createRunStore } from './run-store';
import { applyInputs, toRecord, toView } from './variables';

/** Propriétaire unique de la V1 (mono-utilisateur). Toutes les opérations sont déjà filtrées par propriétaire. */
export const LOCAL_OWNER = 'local';

export type Store = ReturnType<typeof createStore>;

/**
 * Accès aux données du domaine. Seule couche qui connaît MongoDB : elle reçoit et renvoie les
 * objets de l'API (`@restapi/shared`) et lève des DomainError.
 */
export function createStore(connection: Connection, box: SecretBox) {
  const m = registerModels(connection);
  const { runs, sends } = createRunStore(m);

  const oid = toObjectId;

  async function findCollection(owner: string, id: string) {
    const doc = await m.Collection.findOne({ _id: oid(id), owner }).lean<CollectionDoc>();
    if (!doc) throw notFound();
    return doc;
  }

  async function findOwned<T>(
    model: typeof m.Folder | typeof m.Request | typeof m.Environment | typeof m.Scenario,
    owner: string,
    id: string,
  ): Promise<T> {
    const doc = await (model as typeof m.Folder).findOne({ _id: oid(id), owner }).lean<T>();
    if (!doc) throw notFound();
    return doc;
  }

  /** Un Dossier cible doit exister dans la même Collection. */
  async function checkFolder(
    owner: string,
    collectionId: Types.ObjectId,
    folderId: string,
    path: string,
  ) {
    const exists = await m.Folder.exists({ _id: oid(folderId), owner, collectionId });
    if (!exists) throw invalid([{ path, message: 'folder not found in this collection' }]);
  }

  // -------------------------------------------------------------------------
  // Collections
  // -------------------------------------------------------------------------

  const collections = {
    async list(owner: string): Promise<CollectionDto[]> {
      const docs = await m.Collection.find({ owner }).sort({ name: 1 }).lean<CollectionDoc[]>();
      return docs.map(collectionDto);
    },

    async get(owner: string, id: string): Promise<CollectionDto> {
      return collectionDto(await findCollection(owner, id));
    },

    async create(owner: string, input: CollectionInput): Promise<CollectionDto> {
      const doc = await m.Collection.create({
        owner,
        name: input.name,
        variables: applyInputs(input.variables ?? [], [], box),
        auth: input.auth ?? { type: 'none' },
        settings: { ...DEFAULT_HTTP_SETTINGS, ...input.settings },
      });
      return collectionDto(doc.toObject());
    },

    async update(owner: string, id: string, patch: CollectionPatch): Promise<CollectionDto> {
      const existing = await findCollection(owner, id);
      const set: Record<string, unknown> = {};
      if (patch.name !== undefined) set['name'] = patch.name;
      if (patch.variables !== undefined) {
        set['variables'] = applyInputs(patch.variables, existing.variables, box);
      }
      if (patch.auth !== undefined) set['auth'] = patch.auth;
      if (patch.settings !== undefined)
        set['settings'] = { ...existing.settings, ...patch.settings };
      const doc = await m.Collection.findOneAndUpdate(
        { _id: existing._id, owner },
        { $set: set },
        { returnDocument: 'after' },
      ).lean<CollectionDoc>();
      return collectionDto(doc!);
    },

    /** Supprime la Collection et tout ce qu'elle contient. */
    async delete(owner: string, id: string): Promise<void> {
      const { _id } = await findCollection(owner, id);
      const scope = { owner, collectionId: _id };
      await Promise.all([
        m.Folder.deleteMany(scope),
        m.Request.deleteMany(scope),
        m.Environment.deleteMany(scope),
        m.Scenario.deleteMany(scope),
        runs.deleteForCollection(owner, _id),
        sends.deleteForCollection(owner, _id),
      ]);
      await m.Collection.deleteOne({ _id, owner });
    },

    async tree(owner: string, id: string): Promise<CollectionTree> {
      const collection = await findCollection(owner, id);
      const scope = { owner, collectionId: collection._id };
      const [folders, requests, scenarios, environments] = await Promise.all([
        m.Folder.find(scope).sort({ name: 1 }).lean<FolderDoc[]>(),
        m.Request.find(scope, { name: 1, method: 1, folderId: 1 })
          .sort({ name: 1 })
          .lean<Pick<RequestDoc, '_id' | 'name' | 'method' | 'folderId'>[]>(),
        m.Scenario.find(scope, { name: 1 })
          .sort({ name: 1 })
          .lean<Pick<ScenarioDoc, '_id' | 'name'>[]>(),
        m.Environment.find(scope, { name: 1 })
          .sort({ name: 1 })
          .lean<Pick<EnvironmentDoc, '_id' | 'name'>[]>(),
      ]);
      return {
        collection: { id: String(collection._id), name: collection.name },
        folders: folders.map(folderDto),
        requests: requests.map((r) => ({
          id: String(r._id),
          name: r.name,
          method: r.method as HttpMethod,
          folderId: r.folderId ? String(r.folderId) : null,
        })),
        scenarios: scenarios.map((s) => ({ id: String(s._id), name: s.name })),
        environments: environments.map((e) => ({ id: String(e._id), name: e.name })),
      };
    },
  };

  // -------------------------------------------------------------------------
  // Dossiers
  // -------------------------------------------------------------------------

  const folders = {
    async create(owner: string, collectionId: string, input: FolderInput): Promise<FolderDto> {
      const collection = await findCollection(owner, collectionId);
      if (input.parentId) await checkFolder(owner, collection._id, input.parentId, 'parentId');
      const doc = await m.Folder.create({
        owner,
        collectionId: collection._id,
        parentId: input.parentId ? oid(input.parentId) : null,
        name: input.name,
      });
      return folderDto(doc.toObject());
    },

    async update(owner: string, id: string, patch: Partial<FolderInput>): Promise<FolderDto> {
      const folder = await findOwned<FolderDoc>(m.Folder, owner, id);
      const set: Record<string, unknown> = {};
      if (patch.name !== undefined) set['name'] = patch.name;
      if (patch.parentId !== undefined) {
        if (patch.parentId !== null) {
          await checkFolder(owner, folder.collectionId, patch.parentId, 'parentId');
          await checkNoCycle(owner, folder._id, oid(patch.parentId));
        }
        set['parentId'] = patch.parentId === null ? null : oid(patch.parentId);
      }
      const doc = await m.Folder.findOneAndUpdate(
        { _id: folder._id, owner },
        { $set: set },
        { returnDocument: 'after' },
      ).lean<FolderDoc>();
      return folderDto(doc!);
    },

    /** Refuse de supprimer un Dossier qui contient des Dossiers ou des Requêtes. */
    async delete(owner: string, id: string): Promise<void> {
      const folder = await findOwned<FolderDoc>(m.Folder, owner, id);
      const [subFolders, requests] = await Promise.all([
        m.Folder.countDocuments({ owner, parentId: folder._id }),
        m.Request.countDocuments({ owner, folderId: folder._id }),
      ]);
      if (subFolders + requests > 0) throw new DomainError(409, ErrorCode.FolderNotEmpty);
      await m.Folder.deleteOne({ _id: folder._id, owner });
    },
  };

  /** Un Dossier ne peut pas être déplacé dans lui-même ni dans l'un de ses descendants. */
  async function checkNoCycle(owner: string, folderId: Types.ObjectId, newParent: Types.ObjectId) {
    let current: Types.ObjectId | null = newParent;
    while (current) {
      if (current.equals(folderId)) {
        throw invalid([
          { path: 'parentId', message: 'folder cannot be moved into itself or a descendant' },
        ]);
      }
      const parent: { parentId?: Types.ObjectId | null } | null = await m.Folder.findOne(
        { _id: current, owner },
        { parentId: 1 },
      ).lean();
      current = parent?.parentId ?? null;
    }
  }

  // -------------------------------------------------------------------------
  // Requêtes
  // -------------------------------------------------------------------------

  const requests = {
    async get(owner: string, id: string): Promise<RequestDto> {
      return requestDto(await findOwned<RequestDoc>(m.Request, owner, id));
    },

    async create(owner: string, collectionId: string, input: RequestInput): Promise<RequestDto> {
      const collection = await findCollection(owner, collectionId);
      if (input.folderId) await checkFolder(owner, collection._id, input.folderId, 'folderId');
      const { folderId, ...definition } = input;
      const doc = await m.Request.create({
        owner,
        collectionId: collection._id,
        folderId: folderId ? oid(folderId) : null,
        ...definition,
      });
      return requestDto(doc.toObject());
    },

    /** Remplace la définition. Sans `folderId`, la Requête reste dans son Dossier. */
    async update(owner: string, id: string, input: RequestInput): Promise<RequestDto> {
      const existing = await findOwned<RequestDoc>(m.Request, owner, id);
      const { folderId, settings, ...definition } = input;
      if (folderId) await checkFolder(owner, existing.collectionId, folderId, 'folderId');
      const set: Record<string, unknown> = { ...definition };
      if (folderId !== undefined) set['folderId'] = folderId === null ? null : oid(folderId);
      const update =
        settings === undefined
          ? { $set: set, $unset: { settings: 1 } }
          : { $set: { ...set, settings } };
      const doc = await m.Request.findOneAndUpdate({ _id: existing._id, owner }, update, {
        returnDocument: 'after',
      }).lean<RequestDoc>();
      return requestDto(doc!);
    },

    /**
     * Refuse (409 REQUEST_IN_USE) si des Scénarios utilisent la Requête, sauf avec `force` :
     * leurs Étapes deviennent alors des Étapes orphelines.
     */
    async delete(owner: string, id: string, options: { force?: boolean } = {}): Promise<void> {
      const request = await findOwned<RequestDoc>(m.Request, owner, id);
      if (!options.force) {
        const users = await m.Scenario.find(
          { owner, collectionId: request.collectionId, requestIds: String(request._id) },
          { name: 1 },
        )
          .sort({ name: 1 })
          .lean<Pick<ScenarioDoc, '_id' | 'name'>[]>();
        if (users.length > 0) {
          const details: RequestInUseDetails = {
            scenarios: users.map((s) => ({ id: String(s._id), name: s.name })),
          };
          throw new DomainError(409, ErrorCode.RequestInUse, details);
        }
      }
      await m.Request.deleteOne({ _id: request._id, owner });
      await sends.deleteForRequest(owner, String(request._id));
    },
  };

  // -------------------------------------------------------------------------
  // Environnements
  // -------------------------------------------------------------------------

  const environments = {
    async list(owner: string, collectionId: string): Promise<EnvironmentDto[]> {
      const collection = await findCollection(owner, collectionId);
      const docs = await m.Environment.find({ owner, collectionId: collection._id })
        .sort({ name: 1 })
        .lean<EnvironmentDoc[]>();
      return docs.map(environmentDto);
    },

    async get(owner: string, id: string): Promise<EnvironmentDto> {
      return environmentDto(await findOwned<EnvironmentDoc>(m.Environment, owner, id));
    },

    async create(
      owner: string,
      collectionId: string,
      input: EnvironmentInput,
    ): Promise<EnvironmentDto> {
      const collection = await findCollection(owner, collectionId);
      const doc = await m.Environment.create({
        owner,
        collectionId: collection._id,
        name: input.name,
        variables: applyInputs(input.variables ?? [], [], box),
      });
      return environmentDto(doc.toObject());
    },

    async update(owner: string, id: string, input: EnvironmentInput): Promise<EnvironmentDto> {
      const existing = await findOwned<EnvironmentDoc>(m.Environment, owner, id);
      const doc = await m.Environment.findOneAndUpdate(
        { _id: existing._id, owner },
        {
          $set: {
            name: input.name,
            variables: applyInputs(input.variables ?? [], existing.variables, box),
          },
        },
        { returnDocument: 'after' },
      ).lean<EnvironmentDoc>();
      return environmentDto(doc!);
    },

    async delete(owner: string, id: string): Promise<void> {
      const env = await findOwned<EnvironmentDoc>(m.Environment, owner, id);
      await m.Environment.deleteOne({ _id: env._id, owner });
    },
  };

  // -------------------------------------------------------------------------
  // Scénarios
  // -------------------------------------------------------------------------

  const scenarios = {
    async list(owner: string, collectionId: string): Promise<ScenarioDto[]> {
      const collection = await findCollection(owner, collectionId);
      const docs = await m.Scenario.find({ owner, collectionId: collection._id })
        .sort({ name: 1 })
        .lean<ScenarioDoc[]>();
      return docs.map(scenarioDto);
    },

    async get(owner: string, id: string): Promise<ScenarioDto> {
      return scenarioDto(await findOwned<ScenarioDoc>(m.Scenario, owner, id));
    },

    async create(owner: string, collectionId: string, input: ScenarioInput): Promise<ScenarioDto> {
      const collection = await findCollection(owner, collectionId);
      const doc = await m.Scenario.create({
        owner,
        collectionId: collection._id,
        name: input.name,
        root: input.root,
        requestIds: referencedRequestIds(input.root),
      });
      return scenarioDto(doc.toObject());
    },

    async update(owner: string, id: string, input: ScenarioInput): Promise<ScenarioDto> {
      const existing = await findOwned<ScenarioDoc>(m.Scenario, owner, id);
      const doc = await m.Scenario.findOneAndUpdate(
        { _id: existing._id, owner },
        {
          $set: {
            name: input.name,
            root: input.root,
            requestIds: referencedRequestIds(input.root),
          },
        },
        { returnDocument: 'after' },
      ).lean<ScenarioDoc>();
      return scenarioDto(doc!);
    },

    async delete(owner: string, id: string): Promise<void> {
      const scenario = await findOwned<ScenarioDoc>(m.Scenario, owner, id);
      await m.Scenario.deleteOne({ _id: scenario._id, owner });
    },

    /** Anomalies du Scénario, au regard de sa Collection et de ses Environnements. */
    async issues(owner: string, id: string): Promise<ScenarioIssue[]> {
      const scenario = await findOwned<ScenarioDoc>(m.Scenario, owner, id);
      const scope = { owner, collectionId: scenario.collectionId };
      const [collection, envs, reqs] = await Promise.all([
        m.Collection.findOne(
          { _id: scenario.collectionId, owner },
          { variables: 1 },
        ).lean<CollectionDoc>(),
        m.Environment.find(scope, { variables: 1 }).lean<EnvironmentDoc[]>(),
        m.Request.find(scope).lean<RequestDoc[]>(),
      ]);
      const definedVariables = new Set([
        ...(collection?.variables ?? []).map((v) => v.name),
        ...envs.flatMap((e) => e.variables.map((v) => v.name)),
      ]);
      return validateScenario(scenarioDto(scenario), {
        requests: Object.fromEntries(reqs.map((r) => [String(r._id), requestDefinition(r)])),
        definedVariables,
      });
    },
  };

  // -------------------------------------------------------------------------
  // Préparation des Exécutions et des Envois (valeurs secrètes en clair, en mémoire seulement)
  // -------------------------------------------------------------------------

  /** Variables de la Collection et de l'Environnement choisi, déchiffrées, avec la liste des secrets. */
  async function executionContext(
    owner: string,
    collectionId: Types.ObjectId,
    environmentId: string | null | undefined,
  ) {
    const collection = await m.Collection.findOne({
      _id: collectionId,
      owner,
    }).lean<CollectionDoc>();
    if (!collection) throw notFound();
    let environment: EnvironmentDoc | null = null;
    if (environmentId) {
      if (!isObjectId(environmentId)) {
        throw invalid([{ path: 'environmentId', message: 'invalid id' }]);
      }
      environment = await m.Environment.findOne({
        _id: new Types.ObjectId(environmentId),
        owner,
        collectionId,
      }).lean<EnvironmentDoc>();
      if (!environment) {
        throw invalid([
          { path: 'environmentId', message: 'environment not found in this collection' },
        ]);
      }
    }
    const secrets = [...collection.variables, ...(environment?.variables ?? [])]
      .filter((v) => v.secret)
      .map((v) => toRecord([v], box)[v.name]!)
      .filter((v) => v !== '');
    return {
      collection: {
        variables: toRecord(collection.variables, box),
        auth: collection.auth as CollectionAuth,
        settings: collection.settings as HttpSettings,
      },
      environment: environment
        ? { name: environment.name, variables: toRecord(environment.variables, box) }
        : null,
      secrets,
    };
  }

  const execution = {
    /**
     * Instantané d'un Scénario prêt à être lancé, avec ses Anomalies (calculées avec les
     * Variables réellement disponibles : Collection, Environnement choisi, Paramètres).
     */
    async scenarioSnapshot(
      owner: string,
      scenarioId: string,
      environmentId: string | null | undefined,
      parameters: Record<string, string>,
    ): Promise<{
      snapshot: RunSnapshot;
      secrets: string[];
      issues: ScenarioIssue[];
      collectionId: string;
    }> {
      const scenarioDoc = await findOwned<ScenarioDoc>(m.Scenario, owner, scenarioId);
      const ctx = await executionContext(owner, scenarioDoc.collectionId, environmentId);
      const reqs = await m.Request.find({
        owner,
        collectionId: scenarioDoc.collectionId,
        _id: { $in: scenarioDoc.requestIds.filter(isObjectId) },
      }).lean<RequestDoc[]>();
      const scenario = scenarioDto(scenarioDoc);
      const requestsById = Object.fromEntries(
        reqs.map((r) => [String(r._id), requestDefinition(r)]),
      );
      const snapshot: RunSnapshot = {
        scenario: { id: scenario.id, name: scenario.name, root: scenario.root },
        requests: requestsById,
        collection: ctx.collection,
        environment: ctx.environment,
        parameters,
      };
      const issues = validateScenario(snapshot.scenario, {
        requests: requestsById,
        definedVariables: [
          ...Object.keys(ctx.collection.variables),
          ...Object.keys(ctx.environment?.variables ?? {}),
          ...Object.keys(parameters),
        ],
      });
      return {
        snapshot,
        secrets: ctx.secrets,
        issues,
        collectionId: String(scenarioDoc.collectionId),
      };
    },

    /** Variables d'une Collection et de l'Environnement choisi (évaluation dans l'éditeur). */
    async collectionContext(
      owner: string,
      collectionId: string,
      environmentId: string | null | undefined,
    ) {
      return executionContext(owner, oid(collectionId), environmentId);
    },

    /** Ce qu'il faut pour l'Envoi d'une Requête seule. */
    async requestContext(
      owner: string,
      requestId: string,
      environmentId: string | null | undefined,
    ) {
      const doc = await findOwned<RequestDoc>(m.Request, owner, requestId);
      const ctx = await executionContext(owner, doc.collectionId, environmentId);
      return { request: requestDefinition(doc), collectionId: String(doc.collectionId), ...ctx };
    },
  };

  return { collections, folders, requests, environments, scenarios, runs, sends, execution };
}

// ---------------------------------------------------------------------------
// Conversions document → objet de l'API
// ---------------------------------------------------------------------------

function collectionDto(doc: CollectionDoc): CollectionDto {
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

function folderDto(doc: FolderDoc): FolderDto {
  return {
    id: String(doc._id),
    collectionId: String(doc.collectionId),
    parentId: doc.parentId ? String(doc.parentId) : null,
    name: doc.name,
  };
}

function requestDefinition(doc: RequestDoc): RequestDefinition {
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

function requestDto(doc: RequestDoc): RequestDto {
  return {
    ...requestDefinition(doc),
    collectionId: String(doc.collectionId),
    folderId: doc.folderId ? String(doc.folderId) : null,
  };
}

function environmentDto(doc: EnvironmentDoc): EnvironmentDto {
  return {
    id: String(doc._id),
    collectionId: String(doc.collectionId),
    name: doc.name,
    variables: doc.variables.map(toView),
  };
}

function scenarioDto(doc: ScenarioDoc): ScenarioDto {
  return {
    id: String(doc._id),
    collectionId: String(doc.collectionId),
    name: doc.name,
    root: doc.root as GroupStep,
  };
}

function referencedRequestIds(root: GroupStep): string[] {
  const ids = new Set<string>();
  const visit = (step: Step) => {
    if (step.type === 'request') ids.add(step.requestId);
    if (step.type === 'group') step.steps.forEach(visit);
  };
  visit(root);
  return [...ids];
}
