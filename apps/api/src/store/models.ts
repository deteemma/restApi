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

export type StoredVariable = InferSchemaType<typeof variableSchema>;
export type CollectionDoc = InferSchemaType<typeof collectionSchema> & { _id: Types.ObjectId };
export type FolderDoc = InferSchemaType<typeof folderSchema> & { _id: Types.ObjectId };
export type RequestDoc = InferSchemaType<typeof requestSchema> & { _id: Types.ObjectId };
export type EnvironmentDoc = InferSchemaType<typeof environmentSchema> & { _id: Types.ObjectId };
export type ScenarioDoc = InferSchemaType<typeof scenarioSchema> & { _id: Types.ObjectId };

export function registerModels(connection: Connection) {
  return {
    Collection: connection.model('Collection', collectionSchema),
    Folder: connection.model('Folder', folderSchema),
    Request: connection.model('Request', requestSchema),
    Environment: connection.model('Environment', environmentSchema),
    Scenario: connection.model('Scenario', scenarioSchema),
  };
}

export type Models = ReturnType<typeof registerModels>;
