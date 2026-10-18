import { SECRET_MASK, type RequestStepResult } from '@restapi/shared';

/** Taille maximale d'un corps de requête ou de réponse stocké (en caractères). */
export const DEFAULT_MAX_BODY_LENGTH = 1_000_000;

/** En dessous de cette longueur, un secret n'est masqué que s'il constitue toute la valeur. */
const MIN_SUBSTRING_SECRET = 3;

const AUTH_HEADERS = new Set(['authorization', 'proxy-authorization']);

export interface Sanitizer {
  /** Copie d'une valeur quelconque (objet, tableau, texte) avec les secrets masqués. */
  value<T>(value: T): T;
  /** Copie d'un résultat d'Étape-requête prête à être stockée ou diffusée. */
  result(result: RequestStepResult): RequestStepResult;
}

/**
 * Prépare ce qui est stocké ou diffusé : valeurs des Variables secrètes masquées, en-têtes
 * d'authentification masqués (un secret encodé, en Basic par exemple, ne serait pas reconnu),
 * corps tronqués.
 */
export function createSanitizer(
  secrets: readonly string[],
  options: { maxBodyLength?: number } = {},
): Sanitizer {
  const maxBodyLength = options.maxBodyLength ?? DEFAULT_MAX_BODY_LENGTH;
  const distinct = [...new Set(secrets.filter((s) => s !== ''))];
  // Le plus long d'abord, pour qu'un secret contenu dans un autre ne laisse pas de morceau visible.
  const substrings = distinct
    .filter((s) => s.length >= MIN_SUBSTRING_SECRET)
    .sort((a, b) => b.length - a.length);
  const exact = new Set(distinct);

  const maskText = (text: string): string => {
    if (exact.has(text)) return SECRET_MASK;
    let out = text;
    for (const secret of substrings) out = out.split(secret).join(SECRET_MASK);
    return out;
  };

  const value = <T>(input: T): T => {
    if (typeof input === 'string') return maskText(input) as T;
    if (Array.isArray(input)) return input.map(value) as T;
    if (input && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, value(v)])) as T;
    }
    return input;
  };

  const truncate = <T extends { body?: string; bodyTruncated?: boolean }>(part: T): T =>
    part.body !== undefined && part.body.length > maxBodyLength
      ? { ...part, body: part.body.slice(0, maxBodyLength), bodyTruncated: true }
      : part;

  const result = (raw: RequestStepResult): RequestStepResult => {
    const clean = value(raw);
    if (clean.request) {
      const headers = Object.fromEntries(
        Object.entries(clean.request.headers).map(([name, v]) =>
          AUTH_HEADERS.has(name.toLowerCase()) ? [name, maskCredentials(v)] : [name, v],
        ),
      );
      clean.request = truncate({ ...clean.request, headers });
    }
    if (clean.response) clean.response = truncate(clean.response);
    return clean;
  };

  return { value, result };
}

/** « Basic dXNlcjpwd2Q= » devient « Basic •••••• » : on garde le schéma, pas les identifiants. */
function maskCredentials(header: string): string {
  const space = header.indexOf(' ');
  return space > 0 ? `${header.slice(0, space)} ${SECRET_MASK}` : SECRET_MASK;
}
