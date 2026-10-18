import { StepErrorCode } from '@restapi/shared';

export interface BaseVariables {
  collection: Record<string, string>;
  environment: Record<string, string>;
  parameters: Record<string, string>;
}

/**
 * Portée de Variables d'une Exécution. Ordre de priorité, du plus fort au plus faible :
 * Surcharge > Variable d'exécution > Paramètre de lancement > Environnement > Collection.
 *
 * Les Variables d'exécution vivent dans une chaîne de portées :
 * - un Groupe séquentiel partage la portée de son parent, donc une Extraction est visible des Étapes suivantes ;
 * - chaque branche d'un Groupe parallèle reçoit une portée fille (`fork`), fusionnée dans le parent
 *   (`merge`) une fois le Groupe entièrement terminé.
 */
export class VariableScope {
  private readonly own = new Map<string, string>();

  private constructor(
    private readonly base: BaseVariables,
    private readonly parent: VariableScope | null,
    private readonly overrides: Readonly<Record<string, string>> | null,
  ) {}

  static root(base: BaseVariables): VariableScope {
    return new VariableScope(base, null, null);
  }

  get(name: string): string | undefined {
    if (this.overrides && Object.hasOwn(this.overrides, name)) return this.overrides[name];
    if (this.own.has(name)) return this.own.get(name);
    if (this.parent) return this.parent.get(name);
    for (const layer of [this.base.parameters, this.base.environment, this.base.collection]) {
      if (Object.hasOwn(layer, name)) return layer[name];
    }
    return undefined;
  }

  /** Crée ou remplace une Variable d'exécution. */
  set(name: string, value: string): void {
    // Une vue de Surcharge n'a pas de stockage propre : l'écriture va dans la portée réelle.
    if (this.overrides) this.parent!.set(name, value);
    else this.own.set(name, value);
  }

  /** Portée d'une branche de Groupe parallèle. */
  fork(): VariableScope {
    return new VariableScope(this.base, this, null);
  }

  /** Fusionne les écritures des branches, dans l'ordre donné. */
  merge(branches: readonly VariableScope[]): void {
    for (const branch of branches) {
      for (const [name, value] of branch.own) this.own.set(name, value);
    }
  }

  /** Variables d'exécution écrites dans cette portée (y compris celles des branches fusionnées). */
  runVariables(): Record<string, string> {
    return Object.fromEntries(this.own);
  }

  /** Vue de cette portée avec les Surcharges d'une Étape-requête. */
  withOverrides(overrides: Readonly<Record<string, string>> | undefined): VariableScope {
    if (!overrides || Object.keys(overrides).length === 0) return this;
    return new VariableScope(this.base, this, overrides);
  }
}

export class VariableError extends Error {
  constructor(
    readonly code: typeof StepErrorCode.UnknownVariable | typeof StepErrorCode.CircularVariable,
    readonly names: string[],
  ) {
    super(`${code}: ${names.join(', ')}`);
    this.name = 'VariableError';
  }
}

/** Une {{Variable}} dans un texte ; le groupe 1 capture son nom. */
export const PLACEHOLDER = /{{\s*([\w.-]+)\s*}}/g;

/** Remplace les {{Variables}} d'un texte. Les valeurs peuvent elles-mêmes contenir des Variables. */
export function interpolate(template: string, scope: VariableScope): string {
  const unknown = new Set<string>();

  const resolve = (text: string, stack: readonly string[]): string =>
    text.replace(PLACEHOLDER, (match, name: string) => {
      if (stack.includes(name)) {
        throw new VariableError(StepErrorCode.CircularVariable, [...stack, name]);
      }
      const value = scope.get(name);
      if (value === undefined) {
        unknown.add(name);
        return match;
      }
      return resolve(value, [...stack, name]);
    });

  const result = resolve(template, []);
  if (unknown.size > 0) throw new VariableError(StepErrorCode.UnknownVariable, [...unknown]);
  return result;
}
