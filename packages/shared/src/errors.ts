/**
 * Codes d'erreur stables renvoyés par l'API. L'interface les traduit :
 * l'API ne renvoie jamais de message destiné à l'utilisateur.
 */
export const ErrorCode = {
  ApiKeyMissing: 'API_KEY_MISSING',
  ApiKeyInvalid: 'API_KEY_INVALID',
  NotFound: 'NOT_FOUND',
  /** Corps de requête illisible ou non conforme ; `details` liste les champs en cause. */
  ValidationFailed: 'VALIDATION_FAILED',
  /** Suppression refusée : la Requête est utilisée par des Scénarios (listés dans `details`). */
  RequestInUse: 'REQUEST_IN_USE',
  FolderNotEmpty: 'FOLDER_NOT_EMPTY',
  Internal: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ValidationIssue {
  /** Chemin du champ en cause, par exemple `root.steps.0.durationMs`. */
  path: string;
  /** Message technique, en anglais, non traduit. */
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    /** Selon le code : ValidationIssue[] pour VALIDATION_FAILED, Scénarios concernés pour REQUEST_IN_USE. */
    details?: unknown;
  };
}
