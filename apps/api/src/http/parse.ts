import type { z } from 'zod';
import { invalid } from '../errors';

/** Valide une entrée ; en cas d'échec, lève VALIDATION_FAILED avec les champs en cause. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw invalid(
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return result.data;
}
