import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const VERSION = 'v1';
// Sel fixe : la clé dérivée doit être la même à chaque démarrage pour relire les secrets.
const SALT = 'restapi.secret-box.v1';

/**
 * Chiffre les Variables secrètes au repos, en AES-256-GCM.
 * Format : `v1:<iv>:<tag>:<chiffré>`, chaque partie en base64url.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(passphrase: string) {
    this.key = scryptSync(passphrase, SALT, 32);
  }

  seal(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [VERSION, iv, cipher.getAuthTag(), data]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
      .join(':');
  }

  /** Lève une erreur si le chiffré a été altéré ou si la clé ne correspond pas. */
  open(sealed: string): string {
    const [version, iv, tag, data] = sealed.split(':');
    if (version !== VERSION || !iv || !tag || data === undefined) {
      throw new Error('Format de secret inconnu');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
