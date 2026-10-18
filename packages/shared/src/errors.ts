/**
 * Codes d'erreur stables renvoyés par l'API. L'interface les traduit :
 * l'API ne renvoie jamais de message destiné à l'utilisateur.
 */
export const ErrorCode = {
  ApiKeyMissing: 'API_KEY_MISSING',
  ApiKeyInvalid: 'API_KEY_INVALID',
  NotFound: 'NOT_FOUND',
  Internal: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
  };
}
