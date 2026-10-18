import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { createApp } from './app';
import { loadConfig } from './config';
import { SecretBox } from './secrets/secret-box';
import { resolveSecretKey } from './secrets/secret-key';
import { createStore } from './store/store';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

// Le fichier .env, à la racine du dépôt, est facultatif.
try {
  process.loadEnvFile(`${repoRoot}.env`);
} catch {
  // Pas de .env : on garde les valeurs par défaut.
}

const config = loadConfig(process.env);
const box = new SecretBox(
  resolveSecretKey({
    secretKey: config.secretKey,
    production: config.production,
    dataDir: `${repoRoot}.data`,
  }),
);

const connection = await mongoose
  .createConnection(config.mongodbUri, { serverSelectionTimeoutMS: 5000 })
  .asPromise();
const app = createApp(config, { store: createStore(connection, box) });

app.listen(config.port, config.host, () => {
  const auth = config.apiKey ? "clé d'API exigée" : "sans clé d'API";
  console.log(`API à l'écoute sur http://${config.host}:${config.port} (${auth})`);
});
