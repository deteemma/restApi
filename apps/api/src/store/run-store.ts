import { Types } from 'mongoose';
import type {
  RequestStepResult,
  RunDto,
  RunSnapshot,
  RunStats,
  RunStatus,
  RunStepDto,
  RunSummaryDto,
  SendDto,
  FinalStepStatus,
} from '@restapi/shared';
import { notFound } from '../errors';
import { toObjectId } from './ids';
import type { Models, RunDoc, RunStepDoc, SendDoc } from './models';

/** Nombre d'Envois conservés par Requête. */
export const SENDS_KEPT_PER_REQUEST = 20;

export interface NewRun {
  collectionId: string;
  scenarioId: string;
  scenarioName: string;
  environmentName: string | null;
  snapshot: RunSnapshot;
  startedAt: Date;
  expiresAt: Date;
}

export interface FinishedStep {
  stepId: string;
  status: FinalStepStatus;
  startedAt: Date | null;
  finishedAt: Date;
  result?: RequestStepResult;
}

export interface RunListFilter {
  collectionId?: string;
  scenarioId?: string;
  status?: RunStatus;
  limit?: number;
}

export type RunStore = ReturnType<typeof createRunStore>;

/** Persistance des Exécutions (avec leurs Étapes terminées) et des Envois. */
export function createRunStore(m: Models) {
  const oid = toObjectId;

  async function findRun(owner: string, id: string): Promise<RunDoc> {
    const doc = await m.Run.findOne({ _id: oid(id), owner }).lean<RunDoc>();
    if (!doc) throw notFound();
    return doc;
  }

  const runs = {
    async create(owner: string, run: NewRun): Promise<RunSummaryDto> {
      const doc = await m.Run.create({
        owner,
        ...run,
        collectionId: oid(run.collectionId),
        status: 'running',
      });
      return runSummary(doc.toObject());
    },

    async appendStep(runId: string, step: FinishedStep): Promise<void> {
      const run = await m.Run.findById(oid(runId), { expiresAt: 1 }).lean<RunDoc>();
      await m.RunStep.create({
        runId: oid(runId),
        ...step,
        expiresAt: run?.expiresAt ?? undefined,
      });
    },

    async finish(
      runId: string,
      final: {
        status: RunStatus;
        finishedAt: Date;
        stats: RunStats;
        variables: Record<string, string>;
      },
    ): Promise<void> {
      const run = await m.Run.findById(oid(runId), { startedAt: 1 }).lean<RunDoc>();
      if (!run) return;
      await m.Run.updateOne(
        { _id: run._id },
        { $set: { ...final, durationMs: final.finishedAt.getTime() - run.startedAt.getTime() } },
      );
    },

    async list(owner: string, filter: RunListFilter = {}): Promise<RunSummaryDto[]> {
      const query: Record<string, unknown> = { owner };
      if (filter.collectionId) query['collectionId'] = oid(filter.collectionId);
      if (filter.scenarioId) query['scenarioId'] = filter.scenarioId;
      if (filter.status) query['status'] = filter.status;
      const docs = await m.Run.find(query, { snapshot: 0, variables: 0 })
        .sort({ startedAt: -1 })
        .limit(Math.min(Math.max(filter.limit ?? 50, 1), 500))
        .lean<RunDoc[]>();
      return docs.map(runSummary);
    },

    async summary(owner: string, id: string): Promise<RunSummaryDto> {
      return runSummary(await findRun(owner, id));
    },

    async get(owner: string, id: string): Promise<RunDto> {
      const run = await findRun(owner, id);
      const steps = await m.RunStep.find({ runId: run._id })
        .sort({ finishedAt: 1, _id: 1 })
        .lean<RunStepDoc[]>();
      return {
        ...runSummary(run),
        snapshot: run.snapshot as RunSnapshot,
        steps: steps.map(runStepDto),
        variables: (run.variables ?? {}) as Record<string, string>,
      };
    },

    /** Épinglée : jamais purgée. Désépinglée : purgée `retentionMs` après maintenant. */
    async setPinned(
      owner: string,
      id: string,
      pinned: boolean,
      retentionMs: number,
      now: Date,
    ): Promise<RunSummaryDto> {
      const run = await findRun(owner, id);
      const expiresAt = new Date(now.getTime() + retentionMs);
      await Promise.all([
        m.Run.updateOne(
          { _id: run._id },
          pinned ? { $set: { pinned }, $unset: { expiresAt: 1 } } : { $set: { pinned, expiresAt } },
        ),
        m.RunStep.updateMany(
          { runId: run._id },
          pinned ? { $unset: { expiresAt: 1 } } : { $set: { expiresAt } },
        ),
      ]);
      return runSummary(await findRun(owner, id));
    },

    /** Au démarrage : les Exécutions restées « En cours » ont été interrompues par l'arrêt du serveur. */
    async markInterrupted(now: Date): Promise<number> {
      const res = await m.Run.updateMany(
        { status: 'running' },
        { $set: { status: 'stopped', finishedAt: now } },
      );
      return res.modifiedCount;
    },

    async deleteForCollection(owner: string, collectionId: Types.ObjectId): Promise<void> {
      const ids = await m.Run.find({ owner, collectionId }, { _id: 1 }).lean<
        { _id: Types.ObjectId }[]
      >();
      await m.RunStep.deleteMany({ runId: { $in: ids.map((r) => r._id) } });
      await m.Run.deleteMany({ owner, collectionId });
    },
  };

  const sends = {
    /** Enregistre un Envoi et ne garde que les plus récents de la Requête. */
    async add(
      owner: string,
      send: Omit<SendDto, 'id' | 'at'> & { collectionId: string; at: Date },
    ): Promise<SendDto> {
      const doc = await m.Send.create({ owner, ...send, collectionId: oid(send.collectionId) });
      const stale = await m.Send.find({ owner, requestId: send.requestId }, { _id: 1 })
        .sort({ at: -1, _id: -1 })
        .skip(SENDS_KEPT_PER_REQUEST)
        .lean<{ _id: Types.ObjectId }[]>();
      if (stale.length > 0) await m.Send.deleteMany({ _id: { $in: stale.map((s) => s._id) } });
      return sendDto(doc.toObject());
    },

    async list(owner: string, requestId: string): Promise<SendDto[]> {
      const docs = await m.Send.find({ owner, requestId })
        .sort({ at: -1, _id: -1 })
        .lean<SendDoc[]>();
      return docs.map(sendDto);
    },

    async deleteForRequest(owner: string, requestId: string): Promise<void> {
      await m.Send.deleteMany({ owner, requestId });
    },

    async deleteForCollection(owner: string, collectionId: Types.ObjectId): Promise<void> {
      await m.Send.deleteMany({ owner, collectionId });
    },
  };

  return { runs, sends };
}

function runSummary(doc: RunDoc): RunSummaryDto {
  return {
    id: String(doc._id),
    collectionId: String(doc.collectionId),
    scenarioId: doc.scenarioId,
    scenarioName: doc.scenarioName,
    environmentName: doc.environmentName ?? null,
    status: doc.status as RunStatus,
    pinned: Boolean(doc.pinned),
    startedAt: doc.startedAt.toISOString(),
    finishedAt: doc.finishedAt ? doc.finishedAt.toISOString() : null,
    durationMs: doc.durationMs ?? null,
    stats: (doc.stats as RunStats | null) ?? null,
  };
}

function runStepDto(doc: RunStepDoc): RunStepDto {
  return {
    stepId: doc.stepId,
    status: doc.status as FinalStepStatus,
    startedAt: doc.startedAt ? doc.startedAt.toISOString() : null,
    finishedAt: doc.finishedAt.toISOString(),
    ...(doc.result ? { result: doc.result as RequestStepResult } : {}),
  };
}

function sendDto(doc: SendDoc): SendDto {
  return {
    id: String(doc._id),
    requestId: doc.requestId,
    at: doc.at.toISOString(),
    environmentName: doc.environmentName ?? null,
    status: doc.status as SendDto['status'],
    result: doc.result as RequestStepResult,
  };
}
