// Copie la version précompilée de Monaco (min/vs) dans .monaco/, servi par Angular sous /monaco.
// Angular refuse les fichiers statiques hors de son dossier, or node_modules est à la racine du monorepo.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// Le point d'entrée CommonJS du paquet est min/vs/index.js ; son package.json n'est pas exporté.
const vsDir = path.dirname(require.resolve('monaco-editor'));
const { version } = JSON.parse(readFileSync(path.join(vsDir, '..', '..', 'package.json'), 'utf8'));
const target = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.monaco');
const marker = path.join(target, 'VERSION');

if (existsSync(marker) && readFileSync(marker, 'utf8') === version) process.exit(0);

rmSync(target, { recursive: true, force: true });
cpSync(vsDir, path.join(target, 'vs'), { recursive: true });
writeFileSync(marker, version);
console.log(`Monaco ${version} copié dans ${target}`);
