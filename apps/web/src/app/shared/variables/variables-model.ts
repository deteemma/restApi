import type { VariableInput, VariableView } from '@restapi/shared';

/** Une ligne de l'éditeur de Variables. */
export interface VariableRow {
  /** Identifiant local, stable pendant l'édition. */
  key: number;
  name: string;
  secret: boolean;
  /** Valeur saisie. Pour une Variable secrète déjà enregistrée, vide signifie « garder la valeur ». */
  value: string;
  /** Nom sous lequel le serveur connaît une valeur secrète (null si aucune). */
  storedSecretName: string | null;
}

export type RowProblem = 'emptyName' | 'invalidName' | 'duplicate' | 'secretRenamed';

let nextKey = 1;

export function newRow(): VariableRow {
  return { key: nextKey++, name: '', secret: false, value: '', storedSecretName: null };
}

export function rowsFromViews(views: readonly VariableView[]): VariableRow[] {
  return views.map((v) => ({
    key: nextKey++,
    name: v.name,
    secret: v.secret,
    value: v.secret ? '' : v.value,
    storedSecretName: v.secret && v.hasValue ? v.name : null,
  }));
}

/** Vrai si la ligne garde, sans la connaître, la valeur secrète déjà enregistrée. */
export function keepsStoredSecret(row: VariableRow): boolean {
  return row.value === '' && row.storedSecretName !== null && row.storedSecretName === row.name;
}

/** Même grammaire que l'API et le moteur. */
const NAME = /^[\w.-]{1,100}$/;

export function rowProblems(rows: readonly VariableRow[]): Map<number, RowProblem> {
  const problems = new Map<number, RowProblem>();
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.name, (counts.get(row.name) ?? 0) + 1);
  for (const row of rows) {
    if (row.name === '') problems.set(row.key, 'emptyName');
    else if (!NAME.test(row.name)) problems.set(row.key, 'invalidName');
    else if ((counts.get(row.name) ?? 0) > 1) problems.set(row.key, 'duplicate');
    // Le serveur retrouve une valeur secrète par son nom : renommée, elle doit être ressaisie.
    else if (row.storedSecretName && row.storedSecretName !== row.name && row.value === '') {
      problems.set(row.key, 'secretRenamed');
    }
  }
  return problems;
}

/** Renvoie des Variables telles quelles : les secrètes partent sans valeur, le serveur les garde. */
export function unchangedInputs(views: readonly VariableView[]): VariableInput[] {
  return views.map((v) =>
    v.secret ? { name: v.name, secret: true } : { name: v.name, secret: false, value: v.value },
  );
}

/** Ce qu'on envoie à l'API. Une Variable secrète inchangée part sans valeur : le serveur la garde. */
export function toInputs(rows: readonly VariableRow[]): VariableInput[] {
  return rows.map((row) =>
    keepsStoredSecret(row)
      ? { name: row.name, secret: row.secret }
      : { name: row.name, secret: row.secret, value: row.value },
  );
}
