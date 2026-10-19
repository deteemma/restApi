import type * as Monaco from 'monaco-editor';

export type MonacoApi = typeof Monaco;

/** Où Angular sert la version précompilée de Monaco (copiée par scripts/copy-monaco.mjs). */
const MONACO_BASE = '/monaco/vs';

interface AmdRequire {
  (deps: string[], onLoad: (module: MonacoApi) => void, onError: (error: unknown) => void): void;
  config(options: { paths: Record<string, string> }): void;
}

let loading: Promise<MonacoApi> | null = null;

/**
 * Charge Monaco une seule fois, à la première demande, par son chargeur AMD.
 * Le paquet principal de l'application n'en contient rien.
 */
export function loadMonaco(): Promise<MonacoApi> {
  loading ??= new Promise<MonacoApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${MONACO_BASE}/loader.js`;
    script.onerror = () => reject(new Error('Monaco indisponible'));
    script.onload = () => {
      const amdRequire = (window as unknown as { require: AmdRequire }).require;
      amdRequire.config({ paths: { vs: MONACO_BASE } });
      amdRequire(
        ['vs/editor/editor.main'],
        (module) => resolve(module ?? (window as unknown as { monaco: MonacoApi }).monaco),
        reject,
      );
    };
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    loading = null; // on pourra réessayer
    throw error;
  });
  return loading;
}
