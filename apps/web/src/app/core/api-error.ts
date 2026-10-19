import { HttpErrorResponse } from '@angular/common/http';
import { ErrorCode, type ApiErrorBody } from '@restapi/shared';

const KNOWN_CODES = new Set<string>(Object.values(ErrorCode));

/** Code d'erreur de l'API porté par une erreur HTTP, ou null (réseau, erreur inattendue…). */
export function apiErrorCode(error: unknown): ErrorCode | null {
  if (!(error instanceof HttpErrorResponse)) return null;
  const code = (error.error as Partial<ApiErrorBody> | null)?.error?.code;
  return typeof code === 'string' && KNOWN_CODES.has(code) ? (code as ErrorCode) : null;
}

/** Détails accompagnant le code d'erreur (voir ApiErrorBody). */
export function apiErrorDetails<T>(error: unknown): T | undefined {
  if (!(error instanceof HttpErrorResponse)) return undefined;
  return (error.error as Partial<ApiErrorBody> | null)?.error?.details as T | undefined;
}
