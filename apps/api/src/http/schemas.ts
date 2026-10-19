import { z } from 'zod';
import {
  ASSERTION_OPERATORS,
  HTTP_METHODS,
  type CollectionAuth,
  type CollectionInput,
  type EnvironmentInput,
  type FolderInput,
  type GroupStep,
  type RequestAuth,
  type RequestBody,
  type RequestInput,
  type EvaluateInput,
  type RunInput,
  type RunPatch,
  type SendInput,
  type ScenarioInput,
  type Step,
  type VariableInput,
} from '@restapi/shared';

/** Même grammaire que les {{Variables}} reconnues par le moteur. */
export const variableName = z.string().regex(/^[\w.-]{1,100}$/, 'invalid variable name');
const name = z.string().trim().min(1).max(200);
const text = (max = 100_000) => z.string().max(max);
export const objectIdLike = z.string().regex(/^[a-f\d]{24}$/i, 'invalid id');

const keyValue = z.object({
  name: text(1_000),
  value: text(),
  enabled: z.boolean().optional(),
});

const body: z.ZodType<RequestBody> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('json'), content: text(5_000_000) }),
  z.object({ type: z.literal('text'), content: text(5_000_000) }),
  z.object({ type: z.literal('xml'), content: text(5_000_000) }),
  z.object({ type: z.literal('form'), fields: z.array(keyValue).max(500) }),
]);

const collectionAuthOptions = [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('basic'), username: text(1_000), password: text(1_000) }),
  z.object({ type: z.literal('bearer'), token: text(10_000) }),
  z.object({
    type: z.literal('apiKey'),
    name: text(1_000).min(1),
    value: text(10_000),
    in: z.enum(['header', 'query']),
  }),
] as const;
const collectionAuth: z.ZodType<CollectionAuth> = z.discriminatedUnion('type', [
  ...collectionAuthOptions,
]);
const requestAuth: z.ZodType<RequestAuth> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('inherit') }),
  ...collectionAuthOptions,
]);

const httpSettings = z
  .object({
    timeoutMs: z.int().min(1).max(600_000),
    followRedirects: z.boolean(),
    ignoreTlsErrors: z.boolean(),
  })
  .partial();

const jsonPath = z.object({ type: z.literal('jsonPath'), path: text(1_000).min(1) });
const header = z.object({ type: z.literal('header'), name: text(1_000).min(1) });
const status = z.object({ type: z.literal('status') });

export const assertion = z.object({
  target: z.discriminatedUnion('type', [
    status,
    header,
    jsonPath,
    z.object({ type: z.literal('duration') }),
  ]),
  operator: z.enum(ASSERTION_OPERATORS),
  expected: text(10_000).optional(),
});

const extraction = z.object({
  variable: variableName,
  source: z.discriminatedUnion('type', [status, header, jsonPath]),
});

export const requestInput = z.object({
  name,
  method: z.enum(HTTP_METHODS),
  url: text(10_000),
  query: z.array(keyValue).max(500).default([]),
  headers: z.array(keyValue).max(500).default([]),
  body: body.default({ type: 'none' }),
  auth: requestAuth.default({ type: 'inherit' }),
  assertions: z.array(assertion).max(200).default([]),
  settings: httpSettings.optional(),
  folderId: objectIdLike.nullable().optional(),
}) satisfies z.ZodType<RequestInput>;

const stepId = z.string().min(1).max(100);

// Union simple (et non discriminée) : zod ne peut pas discriminer sur le Groupe récursif.
const step: z.ZodType<Step> = z.lazy(() =>
  z.union([
    z.object({
      id: stepId,
      type: z.literal('request'),
      requestId: z.string().min(1).max(100),
      overrides: z
        .object({
          variables: z.record(variableName, text()).optional(),
          headers: z.array(keyValue).max(500).optional(),
          body: body.optional(),
        })
        .optional(),
      extractions: z.array(extraction).max(100).default([]),
    }),
    group,
    z.object({ id: stepId, type: z.literal('pause'), durationMs: z.int().min(0).max(3_600_000) }),
  ]),
);

const group: z.ZodType<GroupStep> = z.lazy(() =>
  z.object({
    id: stepId,
    type: z.literal('group'),
    name: z.string().max(200).optional(),
    mode: z.enum(['sequential', 'parallel']),
    maxConcurrency: z.int().min(1).max(100).optional(),
    stopOnFailure: z.boolean().optional(),
    steps: z.array(step).max(1_000),
  }),
);

export const scenarioInput = z.object({ name, root: group }) satisfies z.ZodType<ScenarioInput>;

const variables = z
  .array(
    z.object({
      name: variableName,
      secret: z.boolean().optional(),
      value: text().optional(),
    }) satisfies z.ZodType<VariableInput>,
  )
  .max(1_000)
  .refine(
    (vars) => new Set(vars.map((v) => v.name)).size === vars.length,
    'duplicate variable name',
  );

export const collectionInput = z.object({
  name,
  variables: variables.optional(),
  auth: collectionAuth.optional(),
  settings: httpSettings.optional(),
}) satisfies z.ZodType<CollectionInput>;

export const collectionPatch = collectionInput.partial();

export const folderInput = z.object({
  name,
  parentId: objectIdLike.nullable().optional(),
}) satisfies z.ZodType<FolderInput>;

export const folderPatch = folderInput.partial();

export const environmentInput = z.object({
  name,
  variables: variables.optional(),
}) satisfies z.ZodType<EnvironmentInput>;

export const runInput = z.object({
  environmentId: objectIdLike.nullable().optional(),
  parameters: z.record(variableName, text()).optional(),
}) satisfies z.ZodType<RunInput>;

export const runPatch = z.object({ pinned: z.boolean() }) satisfies z.ZodType<RunPatch>;

export const sendInput = z.object({
  environmentId: objectIdLike.nullable().optional(),
  draft: requestInput.optional(),
}) satisfies z.ZodType<SendInput>;

export const runListQuery = z.object({
  collectionId: objectIdLike.optional(),
  scenarioId: z.string().max(100).optional(),
  status: z.enum(['running', 'succeeded', 'failed', 'stopped']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  before: z.coerce.date().optional(),
  pinned: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const evaluateInput = z.object({
  response: z.object({
    status: z.int().min(0).max(999),
    statusText: z.string().max(1_000),
    headers: z.record(z.string(), z.string()),
    body: z.string().max(5_000_000),
    durationMs: z.number().min(0),
    bodyTruncated: z.boolean().optional(),
  }),
  assertions: z.array(assertion).max(200).optional(),
  extractions: z.array(extraction).max(100).optional(),
  environmentId: objectIdLike.nullable().optional(),
}) satisfies z.ZodType<EvaluateInput>;
