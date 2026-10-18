import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface SecretKeyOptions {
  secretKey?: string;
  production: boolean;
  /** Dossier de la clé générée en développement. */
  dataDir: string;
}

/**
 * Clé de chiffrement des Variables secrètes. SECRET_KEY est obligatoire en production.
 * En développement, une clé est générée une fois puis relue depuis `<dataDir>/secret.key` :
 * si ce fichier est perdu, les secrets déjà enregistrés deviennent illisibles.
 */
export function resolveSecretKey(options: SecretKeyOptions): string {
  if (options.secretKey) return options.secretKey;
  if (options.production) {
    throw new Error(
      'SECRET_KEY est obligatoire en production (chiffrement des Variables secrètes).',
    );
  }
  const file = path.join(options.dataDir, 'secret.key');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();

  const key = randomBytes(32).toString('hex');
  mkdirSync(options.dataDir, { recursive: true });
  writeFileSync(file, `${key}\n`, { mode: 0o600 });
  console.warn(`SECRET_KEY absente : clé de développement générée dans ${file}`);
  return key;
}
