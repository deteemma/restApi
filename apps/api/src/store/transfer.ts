import type { Types } from 'mongoose';
import {
  EXPORT_FORMAT,
  EXPORT_SCHEMA_VERSION,
  type CollectionDto,
  type CollectionExport,
  type ExportedVariable,
  type GroupStep,
  type Step,
  type ValidationIssue,
  type VariableInput,
} from '@restapi/shared';
import { invalid, notFound } from '../errors';
import type { SecretBox } from '../secrets/secret-box';
import { toObjectId } from './ids';
import { collectionDto, referencedRequestIds, requestDefinition } from './mappers';
import type {
  CollectionDoc,
  EnvironmentDoc,
  FolderDoc,
  Models,
  RequestDoc,
  ScenarioDoc,
  StoredVariable,
} from './models';
import { applyInputs } from './variables';

export type Transfer = ReturnType<typeof createTransfer>;

/** Export et import d'une Collection complète au format JSON versionné. */
export function createTransfer(m: Models, box: SecretBox) {
  return {
    async exportCollection(owner: string, id: string): Promise<CollectionExport> {
      const collection = await m.Collection.findOne({
        _id: toObjectId(id),
        owner,
      }).lean<CollectionDoc>();
      if (!collection) throw notFound();
      const scope = { owner, collectionId: collection._id };
      const [folders, requests, environments, scenarios] = await Promise.all([
        m.Folder.find(scope).sort({ name: 1 }).lean<FolderDoc[]>(),
        m.Request.find(scope).sort({ name: 1 }).lean<RequestDoc[]>(),
        m.Environment.find(scope).sort({ name: 1 }).lean<EnvironmentDoc[]>(),
        m.Scenario.find(scope).sort({ name: 1 }).lean<ScenarioDoc[]>(),
      ]);
      return {
        format: EXPORT_FORMAT,
        schemaVersion: EXPORT_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        collection: {
          name: collection.name,
          variables: collection.variables.map(exportVariable),
          auth: collection.auth,
          settings: collection.settings,
        },
        folders: folders.map((f) => ({
          ref: String(f._id),
          parentRef: f.parentId ? String(f.parentId) : null,
          name: f.name,
        })),
        requests: requests.map((r) => {
          const { id, ...definition } = requestDefinition(r);
          return { ...definition, ref: id, folderRef: r.folderId ? String(r.folderId) : null };
        }),
        environments: environments.map((e) => ({
          name: e.name,
          variables: e.variables.map(exportVariable),
        })),
        scenarios: scenarios.map((s) => ({ name: s.name, root: s.root as GroupStep })),
      };
    },

    /**
     * Crée une nouvelle Collection à partir d'un export. Les Variables secrètes arrivent sans
     * valeur. Une Étape qui référence une Requête absente de l'export devient orpheline.
     */
    async importCollection(owner: string, data: CollectionExport): Promise<CollectionDto> {
      checkReferences(data);

      const collection = await m.Collection.create({
        owner,
        name: data.collection.name,
        variables: applyInputs(data.collection.variables.map(importVariable), [], box),
        auth: data.collection.auth,
        settings: data.collection.settings,
      });
      const collectionId = collection._id;
      try {
        // Dossiers : les parents d'abord (l'ordre est garanti sans boucle par checkReferences).
        const folderIds = new Map<string, Types.ObjectId>();
        let remaining = data.folders;
        while (remaining.length > 0) {
          const ready = remaining.filter((f) => f.parentRef === null || folderIds.has(f.parentRef));
          for (const f of ready) {
            const created = await m.Folder.create({
              owner,
              collectionId,
              parentId: f.parentRef ? folderIds.get(f.parentRef)! : null,
              name: f.name,
            });
            folderIds.set(f.ref, created._id);
          }
          remaining = remaining.filter((f) => !ready.includes(f));
        }

        const requestIds = new Map<string, string>();
        for (const { ref, folderRef, ...definition } of data.requests) {
          const created = await m.Request.create({
            owner,
            collectionId,
            folderId: folderRef ? folderIds.get(folderRef)! : null,
            ...definition,
          });
          requestIds.set(ref, String(created._id));
        }

        for (const env of data.environments) {
          await m.Environment.create({
            owner,
            collectionId,
            name: env.name,
            variables: applyInputs(env.variables.map(importVariable), [], box),
          });
        }

        for (const scenario of data.scenarios) {
          const root = remapRequests(scenario.root, requestIds);
          await m.Scenario.create({
            owner,
            collectionId,
            name: scenario.name,
            root,
            requestIds: referencedRequestIds(root),
          });
        }
      } catch (error) {
        // Pas de transaction sur un MongoDB autonome : on défait à la main.
        const scope = { owner, collectionId };
        await Promise.all([
          m.Folder.deleteMany(scope),
          m.Request.deleteMany(scope),
          m.Environment.deleteMany(scope),
          m.Scenario.deleteMany(scope),
          m.Collection.deleteOne({ _id: collectionId }),
        ]);
        throw error;
      }
      return collectionDto(collection.toObject() as CollectionDoc);
    },
  };
}

function exportVariable(v: StoredVariable): ExportedVariable {
  return v.secret
    ? { name: v.name, secret: true }
    : { name: v.name, secret: false, value: v.value ?? '' };
}

function importVariable(v: ExportedVariable): VariableInput {
  return v.secret
    ? { name: v.name, secret: true, value: '' }
    : { name: v.name, secret: false, value: v.value };
}

/** Références cohérentes : refs uniques, Dossiers parents connus et sans boucle. */
function checkReferences(data: CollectionExport): void {
  const issues: ValidationIssue[] = [];
  const folderRefs = new Set<string>();
  data.folders.forEach((f, i) => {
    if (folderRefs.has(f.ref)) issues.push({ path: `folders.${i}.ref`, message: 'duplicate ref' });
    folderRefs.add(f.ref);
  });
  const parentOf = new Map(data.folders.map((f) => [f.ref, f.parentRef]));
  data.folders.forEach((f, i) => {
    if (f.parentRef !== null && !folderRefs.has(f.parentRef)) {
      issues.push({ path: `folders.${i}.parentRef`, message: 'unknown folder' });
      return;
    }
    // Remonter les parents : on doit atteindre la racine sans repasser par ce Dossier.
    const seen = new Set([f.ref]);
    for (let p = f.parentRef; p !== null && p !== undefined; p = parentOf.get(p) ?? null) {
      if (seen.has(p)) {
        issues.push({ path: `folders.${i}.parentRef`, message: 'folder cycle' });
        break;
      }
      seen.add(p);
    }
  });
  const requestRefs = new Set<string>();
  data.requests.forEach((r, i) => {
    if (requestRefs.has(r.ref))
      issues.push({ path: `requests.${i}.ref`, message: 'duplicate ref' });
    requestRefs.add(r.ref);
    if (r.folderRef !== null && !folderRefs.has(r.folderRef)) {
      issues.push({ path: `requests.${i}.folderRef`, message: 'unknown folder' });
    }
  });
  if (issues.length > 0) throw invalid(issues);
}

/** Remplace les refs de Requêtes par les nouveaux identifiants (une ref inconnue est gardée : Étape orpheline). */
function remapRequests(root: GroupStep, ids: ReadonlyMap<string, string>): GroupStep {
  const visit = (step: Step): Step => {
    if (step.type === 'request')
      return { ...step, requestId: ids.get(step.requestId) ?? step.requestId };
    if (step.type === 'group') return { ...step, steps: step.steps.map(visit) };
    return step;
  };
  return visit(root) as GroupStep;
}
