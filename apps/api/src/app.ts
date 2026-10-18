import express, { type ErrorRequestHandler } from 'express';
import { ErrorCode, type ApiErrorBody, type HealthResponse } from '@restapi/shared';
import pkg from '../package.json' with { type: 'json' };
import type { Config } from './config';
import { DomainError } from './errors';
import { runRoutes } from './http/run-routes';
import { managementRoutes } from './http/routes';
import { requireApiKey } from './middleware/api-key';
import type { RunManager } from './runs/run-manager';
import { LOCAL_OWNER, type Store } from './store/store';

export interface AppDependencies {
  /** Absent : seules les routes sans base de données (santé) sont servies. */
  store?: Store;
  /** Nécessite `store`. */
  runs?: RunManager;
}

export function createApp(config: Config, deps: AppDependencies = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10mb' }));

  const api = express.Router();

  // Accessible sans clé, pour les sondes de supervision.
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: pkg.version } satisfies HealthResponse);
  });

  if (config.apiKey) {
    api.use(requireApiKey(config.apiKey));
  }

  // Mono-utilisateur en V1 : tout appartient au propriétaire local (voir Q1).
  api.use((_req, res, next) => {
    res.locals['owner'] = LOCAL_OWNER;
    next();
  });

  if (deps.store) api.use(managementRoutes(deps.store));
  if (deps.store && deps.runs) api.use(runRoutes(deps.store, deps.runs));

  api.use((_req, res) => {
    res.status(404).json({ error: { code: ErrorCode.NotFound } } satisfies ApiErrorBody);
  });

  app.use('/api', api);
  app.use(errorHandler);
  return app;
}

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof DomainError) {
    const body: ApiErrorBody = {
      error: { code: err.code, ...(err.details === undefined ? {} : { details: err.details }) },
    };
    res.status(err.status).json(body);
    return;
  }
  // JSON illisible envoyé par le client (erreur levée par express.json).
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: ErrorCode.ValidationFailed } } satisfies ApiErrorBody);
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: ErrorCode.Internal } } satisfies ApiErrorBody);
};
