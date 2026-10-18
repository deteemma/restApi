import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { ErrorCode, type ApiErrorBody } from '@restapi/shared';

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Exige l'en-tête X-API-Key. Les empreintes ont une taille fixe, ce qui permet une comparaison à temps constant. */
export function requireApiKey(expected: string): RequestHandler {
  const expectedDigest = digest(expected);
  return (req, res, next) => {
    const provided = req.get('X-API-Key');
    if (!provided) {
      res.status(401).json({ error: { code: ErrorCode.ApiKeyMissing } } satisfies ApiErrorBody);
      return;
    }
    if (!timingSafeEqual(digest(provided), expectedDigest)) {
      res.status(401).json({ error: { code: ErrorCode.ApiKeyInvalid } } satisfies ApiErrorBody);
      return;
    }
    next();
  };
}
