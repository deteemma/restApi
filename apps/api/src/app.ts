import express, { type ErrorRequestHandler } from 'express';
import { ErrorCode, type ApiErrorBody, type HealthResponse } from '@restapi/shared';
import pkg from '../package.json' with { type: 'json' };
import type { Config } from './config';
import { requireApiKey } from './middleware/api-key';

export function createApp(config: Config) {
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

  api.use((_req, res) => {
    res.status(404).json({ error: { code: ErrorCode.NotFound } } satisfies ApiErrorBody);
  });

  app.use('/api', api);
  app.use(errorHandler);
  return app;
}

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: { code: ErrorCode.Internal } } satisfies ApiErrorBody);
};
