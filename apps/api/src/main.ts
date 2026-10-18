import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { loadConfig } from './config';

// Le fichier .env, à la racine du dépôt, est facultatif.
try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  // Pas de .env : on garde les valeurs par défaut.
}

const config = loadConfig(process.env);
const app = createApp(config);

app.listen(config.port, config.host, () => {
  const auth = config.apiKey ? "clé d'API exigée" : "sans clé d'API";
  console.log(`API à l'écoute sur http://${config.host}:${config.port} (${auth})`);
});
