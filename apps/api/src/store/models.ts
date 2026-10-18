import { Schema, type Connection, type InferSchemaType, type Types } from 'mongoose';

/**
 * Schémas MongoDB. Les structures riches (corps, authentification, arbre du Scénario…) sont
 * stockées telles quelles (`Mixed`) : elles sont validées à l'entrée de l'API par zod.
 */
const options = { timestamps: true, minimize: false, versionKey: false } as const;
const mixed = { type: Schema.Types.Mixed, required: true };
const ref = { type: Schema.Types.ObjectId, required: true, index: true };

/** Valeur en clair, ou chiffrée par SecretBox si `secret` (une valeur vide reste vide). */
const variableSchema = new Schema(
  { name: { type: String, required: true }, secret: Boolean, value: String },
  { _id: false },
);

const collectionSchema = new Schema(
  {
    owner: { type: String, required: true, index: true },
    name: { type: String, required: true },
    variables: { type: [variableSchema], default: [] },
    auth: mixed,
    settings: mixed,
  },
  options,
);

const folderSchema = new Schema(
  {
    owner: { type: String, required: true },
    collectionId: ref,
    parentId: { type: Schema.Types.ObjectId, default: null },
    name: { type: String, required: true },
  },
  options,
);

const requestSchema = new Schema(
  {
    owner: { type: String, required: true },
    collectionId: ref,
    folderId: { type: Schema.Types.ObjectId, default: null },
    name: { type: String, required: true },
    method: { type: String, required: true },
    url: { type: String, default: '' },
    query: mixed,
    headers: mixed,
    body: mixed,
    auth: mixed,
    assertions: mixed,
    settings: { type: Schema.Types.Mixed, default: undefined },
  },
  options,
);

const environmentSchema = new Schema(
  {
    owner: { type: String, required: true },
    collectionId: ref,
    name: { type: String, required: true },
    variables: { type: [variableSchema], default: [] },
  },
  options,
);

const scenarioSchema = new Schema(
  {
    owner: { type: String, required: true },
    collectionId: ref,
    name: { type: String, required: true },
    root: mixed,
    /** Requêtes référencées dans l'arbre, dénormalisées pour retrouver qui utilise une Requête. */
    requestIds: { type: [String], index: true, default: [] },
  },
  options,
);

/** Purge automatique : MongoDB supprime le document à la date `expiresAt` (absente si épinglé). */
const expiresAt = { type: Date, index: { expireAfterSeconds: 0 } };

const runSchema = new Schema(
  {
    owner: { type: String, required: true },
    collectionId: ref,
    scenarioId: { type: String, required: true, index: true },
    scenarioName: { type: String, required: true },
    environmentName: { type: String, default: null },
    status: { type: String, required: true },
    pinned: { type: Boolean, default: false },
    startedAt: { type: Date, required: true, index: true },
    finishedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },
    stats: { type: Schema.Types.Mixed, default: null },
    /** Instantané et Variables finales, valeurs secrètes masquées. */
    snapshot: mixed,
    variables: { type: Schema.Types.Mixed, default: {} },
    expiresAt,
  },
  options,
);

/** Une Étape terminée d'une Exécution (collection séparée : un document est limité à 16 Mo). */
const runStepSchema = new Schema(
  {
    runId: ref,
    stepId: { type: String, required: true },
    status: { type: String, required: true },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, required: true },
    result: { type: Schema.Types.Mixed, default: undefined },
    expiresAt,
  },
  { ...options, timestamps: false },
);

const sendSchema = new Schema(
  {
    owner: { type: String, required: true },
    collectionId: ref,
    requestId: { type: String, required: true, index: true },
    at: { type: Date, required: true },
    environmentName: { type: String, default: null },
    status: { type: String, required: true },
    result: mixed,
  },
  { ...options, timestamps: false },
);

export type StoredVariable = InferSchemaType<typeof variableSchema>;
export type CollectionDoc = InferSchemaType<typeof collectionSchema> & { _id: Types.ObjectId };
export type FolderDoc = InferSchemaType<typeof folderSchema> & { _id: Types.ObjectId };
export type RequestDoc = InferSchemaType<typeof requestSchema> & { _id: Types.ObjectId };
export type EnvironmentDoc = InferSchemaType<typeof environmentSchema> & { _id: Types.ObjectId };
export type ScenarioDoc = InferSchemaType<typeof scenarioSchema> & { _id: Types.ObjectId };
export type RunDoc = InferSchemaType<typeof runSchema> & { _id: Types.ObjectId };
export type RunStepDoc = InferSchemaType<typeof runStepSchema> & { _id: Types.ObjectId };
export type SendDoc = InferSchemaType<typeof sendSchema> & { _id: Types.ObjectId };

export function registerModels(connection: Connection) {
  return {
    Collection: connection.model('Collection', collectionSchema),
    Folder: connection.model('Folder', folderSchema),
    Request: connection.model('Request', requestSchema),
    Environment: connection.model('Environment', environmentSchema),
    Scenario: connection.model('Scenario', scenarioSchema),
    Run: connection.model('Run', runSchema),
    RunStep: connection.model('RunStep', runStepSchema, 'run_steps'),
    Send: connection.model('Send', sendSchema),
  };
}

export type Models = ReturnType<typeof registerModels>;
