export interface Config {
  host: string;
  port: number;
  /** Si défini, exigé dans l'en-tête X-API-Key pour toute route /api sauf /api/health. */
  apiKey?: string;
  mongodbUri: string;
  /** Phrase de chiffrement des Variables secrètes (voir secret-key.ts si absente). */
  secretKey?: string;
  production: boolean;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const port = Number(env['PORT'] ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT invalide : ${env['PORT']}`);
  }
  const optional = (name: string) => env[name]?.trim() || undefined;
  return {
    host: env['HOST'] ?? '127.0.0.1',
    port,
    apiKey: optional('API_KEY'),
    mongodbUri: optional('MONGODB_URI') ?? 'mongodb://127.0.0.1:27018/restapi',
    secretKey: optional('SECRET_KEY'),
    production: env['NODE_ENV'] === 'production',
  };
}
