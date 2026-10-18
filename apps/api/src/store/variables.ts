import type { VariableInput, VariableView } from '@restapi/shared';
import type { SecretBox } from '../secrets/secret-box';

/** Forme stockée : `value` est chiffrée si la Variable est secrète (sauf valeur vide). */
export interface StoredVariableValue {
  name: string;
  secret?: boolean | null;
  value?: string | null;
}

/** Ce que l'API renvoie : jamais la valeur d'une Variable secrète. */
export function toView(variable: StoredVariableValue): VariableView {
  return variable.secret
    ? { name: variable.name, secret: true, hasValue: Boolean(variable.value) }
    : { name: variable.name, secret: false, value: variable.value ?? '' };
}

/**
 * Applique les Variables envoyées par le client. Une Variable sans `value` garde la valeur déjà
 * enregistrée sous son nom ; sans `secret`, elle garde aussi son caractère secret.
 * Les Variables absentes de `inputs` sont supprimées.
 */
export function applyInputs(
  inputs: readonly VariableInput[],
  existing: readonly StoredVariableValue[],
  box: SecretBox,
): StoredVariableValue[] {
  return inputs.map((input) => {
    const previous = existing.find((v) => v.name === input.name);
    const plain = input.value ?? (previous ? plainValue(previous, box) : '');
    const secret = input.secret ?? previous?.secret ?? false;
    return { name: input.name, secret, value: secret && plain !== '' ? box.seal(plain) : plain };
  });
}

/** Valeurs en clair, pour l'exécution. */
export function toRecord(
  variables: readonly StoredVariableValue[],
  box: SecretBox,
): Record<string, string> {
  return Object.fromEntries(variables.map((v) => [v.name, plainValue(v, box)]));
}

function plainValue(variable: StoredVariableValue, box: SecretBox): string {
  const value = variable.value ?? '';
  return variable.secret && value !== '' ? box.open(value) : value;
}
