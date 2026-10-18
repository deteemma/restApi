import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  clean: true,
  // Le paquet partagé est distribué en TypeScript source : on l'embarque dans le bundle.
  noExternal: ['@restapi/shared'],
});
