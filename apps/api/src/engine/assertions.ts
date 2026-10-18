import { isDeepStrictEqual } from 'node:util';
import { JSONPath } from 'jsonpath-plus';
import type {
  Assertion,
  AssertionResult,
  AssertionTarget,
  ExtractionSource,
  ReceivedResponse,
  ValueType,
} from '@restapi/shared';
import { type VariableScope, interpolate } from './variables';

export type TargetValue = { found: true; value: unknown } | { found: false };

/** Lit dans une réponse la valeur visée par une Assertion ou une Extraction. */
export function readTarget(
  target: AssertionTarget | ExtractionSource,
  response: ReceivedResponse,
): TargetValue {
  switch (target.type) {
    case 'status':
      return { found: true, value: response.status };
    case 'duration':
      return { found: true, value: response.durationMs };
    case 'header': {
      const value = response.headers[target.name.toLowerCase()];
      return value === undefined ? { found: false } : { found: true, value };
    }
    case 'jsonPath':
      return readJsonPath(target.path, response.body);
  }
}

function readJsonPath(path: string, body: string): TargetValue {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { found: false };
  }
  let matches: unknown[];
  try {
    matches = JSONPath({ path, json: json as object, wrap: true }) as unknown[];
  } catch {
    return { found: false };
  }
  if (matches.length === 0) return { found: false };
  // Un seul résultat donne sa valeur ; plusieurs (par exemple `$.items[*].id`) donnent la liste.
  return { found: true, value: matches.length === 1 ? matches[0] : matches };
}

export function evaluateAssertion(
  assertion: Assertion,
  response: ReceivedResponse,
  scope: VariableScope,
): AssertionResult {
  const expected =
    assertion.expected === undefined ? undefined : interpolate(assertion.expected, scope);
  const target = readTarget(assertion.target, response);
  const actual = target.found ? target.value : undefined;
  return {
    assertion,
    passed: passes(assertion.operator, target, expected ?? ''),
    ...(target.found ? { actual } : {}),
    ...(expected === undefined ? {} : { expected }),
  };
}

function passes(operator: Assertion['operator'], target: TargetValue, expected: string): boolean {
  if (operator === 'exists') return target.found;
  if (operator === 'notExists') return !target.found;
  if (!target.found) return false;
  const actual = target.value;

  switch (operator) {
    case 'equals':
      return looselyEquals(actual, expected);
    case 'notEquals':
      return !looselyEquals(actual, expected);
    case 'contains':
      if (Array.isArray(actual)) return actual.some((item) => looselyEquals(item, expected));
      return typeof actual === 'object' ? false : String(actual).includes(expected);
    case 'matches':
      try {
        return new RegExp(expected).test(asText(actual));
      } catch {
        return false;
      }
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte':
      return compareNumbers(operator, actual, expected);
    case 'isType':
      return typeOf(actual) === expected.trim();
  }
}

/**
 * Compare une valeur trouvée à la valeur attendue, saisie sous forme de texte :
 * un texte doit être identique, un nombre, un booléen ou null est comparé à sa forme écrite,
 * et un objet ou une liste est comparé en profondeur à l'attendu lu comme du JSON.
 */
function looselyEquals(actual: unknown, expected: string): boolean {
  if (typeof actual === 'string') return actual === expected;
  if (typeof actual === 'number') return expected.trim() !== '' && Number(expected) === actual;
  if (typeof actual === 'boolean' || actual === null) return String(actual) === expected.trim();
  try {
    return isDeepStrictEqual(actual, JSON.parse(expected));
  } catch {
    return false;
  }
}

function compareNumbers(operator: 'lt' | 'lte' | 'gt' | 'gte', actual: unknown, expected: string) {
  if (typeof actual !== 'number' && typeof actual !== 'string') return false;
  const a = Number(actual);
  const e = Number(expected);
  if (!Number.isFinite(a) || !Number.isFinite(e) || expected.trim() === '') return false;
  switch (operator) {
    case 'lt':
      return a < e;
    case 'lte':
      return a <= e;
    case 'gt':
      return a > e;
    case 'gte':
      return a >= e;
  }
}

function typeOf(value: unknown): ValueType | 'undefined' {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  return t === 'string' || t === 'number' || t === 'boolean' || t === 'object' ? t : 'undefined';
}

/** Forme texte d'une valeur : un texte tel quel, tout le reste en JSON. */
export function asText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}
