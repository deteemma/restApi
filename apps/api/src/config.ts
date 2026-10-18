export interface Config {
  host: string;
  port: number;
  /** Si défini, exigé dans l'en-tête X-API-Key pour toute route /api sauf /api/health. */
  apiKey?: string;
  mongodbUri: string;
  /** Phrase de chiffrement des Variables secrètes (voir secret-key.ts si absente). */
  secretKey?: string;
  production: boolean;
  /** Plafond d'Exécutions simultanées sur le serveur. */
  maxConcurrentRuns: number;
  /** Conservation des Exécutions non épinglées, en jours. */
  runRetentionDays: number;
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const port = Number(env['PORT'] ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT invalide : ${env['PORT']}`);
  }
  const optional = (name: string) => env[name]?.trim() || undefined;
  const positiveInt = (name: string, fallback: number) => {
    const value = Number(optional(name) ?? fallback);
    if (!Number.isInteger(value) || value < 1) throw new Error(`${name} invalide : ${env[name]}`);
    return value;
  };
  return {
    host: env['HOST'] ?? '127.0.0.1',
    port,
    apiKey: optional('API_KEY'),
    mongodbUri: optional('MONGODB_URI') ?? 'mongodb://127.0.0.1:27018/restapi',
    secretKey: optional('SECRET_KEY'),
    production: env['NODE_ENV'] === 'production',
    maxConcurrentRuns: positiveInt('MAX_CONCURRENT_RUNS', 10),
    runRetentionDays: positiveInt('RUN_RETENTION_DAYS', 30),
  };
}
