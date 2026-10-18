import { ErrorCode, type ValidationIssue } from '@restapi/shared';

/** Erreur métier, que la couche HTTP traduit en réponse `{ error: { code, details } }`. */
export class DomainError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = 'DomainError';
  }
}

export const notFound = () => new DomainError(404, ErrorCode.NotFound);

export const invalid = (issues: ValidationIssue[]) =>
  new DomainError(422, ErrorCode.ValidationFailed, issues);
