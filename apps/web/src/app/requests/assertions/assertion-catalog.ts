import {
  ASSERTION_OPERATORS,
  UNARY_ASSERTION_OPERATORS,
  VALUE_TYPES,
  type AssertionOperator,
  type AssertionTarget,
} from '@restapi/shared';

export type TargetType = AssertionTarget['type'];

/**
 * Catalogue des Assertions : ce qu'affichent les infobulles et le panneau d'aide.
 * Les textes sont des clés de traduction (`assertions.targets.<type>`, `assertions.operators.<op>`) ;
 * les exemples sont du code, identiques dans toutes les langues.
 */
export const TARGETS: readonly { type: TargetType; example: string }[] = [
  { type: 'status', example: '201' },
  { type: 'header', example: 'Content-Type' },
  { type: 'jsonPath', example: '$.items[0].id' },
  { type: 'duration', example: '500' },
];

export const OPERATORS: readonly {
  operator: AssertionOperator;
  symbol: string;
  example: string;
}[] = [
  { operator: 'equals', symbol: '=', example: '$.status = active' },
  { operator: 'notEquals', symbol: '≠', example: '$.status ≠ deleted' },
  { operator: 'contains', symbol: '∋', example: '$.tags ∋ vip' },
  { operator: 'exists', symbol: '∃', example: '$.id ∃' },
  { operator: 'notExists', symbol: '∄', example: '$.error ∄' },
  { operator: 'matches', symbol: '~', example: '$.email ~ ^[^@]+@[^@]+$' },
  { operator: 'lt', symbol: '<', example: '$.price < 100' },
  { operator: 'lte', symbol: '≤', example: '$.count ≤ 100' },
  { operator: 'gt', symbol: '>', example: '$.total > 0' },
  { operator: 'gte', symbol: '≥', example: '$.count ≥ 1' },
  { operator: 'isType', symbol: ':', example: '$.items : array' },
];

/** Aide-mémoire des chemins JSON (syntaxe jsonpath-plus, celle du moteur). */
export const JSON_PATH_EXAMPLES: readonly { path: string; key: string }[] = [
  { path: '$.id', key: 'field' },
  { path: '$.customer.address.city', key: 'nested' },
  { path: '$.items[0].name', key: 'index' },
  { path: '$.items[-1:]', key: 'last' },
  { path: '$.items[*].id', key: 'all' },
  { path: '$.items.length', key: 'length' },
  { path: '$..id', key: 'recursive' },
  { path: '$.items[?(@.price > 10)].name', key: 'filter' },
  { path: "$['first name']", key: 'quoted' },
];

export { ASSERTION_OPERATORS, VALUE_TYPES };

export const isUnary = (operator: AssertionOperator) =>
  UNARY_ASSERTION_OPERATORS.includes(operator);

/** Une cible vierge du type demandé, en gardant le nom ou le chemin déjà saisi. */
export function retarget(target: AssertionTarget, type: TargetType): AssertionTarget {
  const text =
    target.type === 'header' ? target.name : target.type === 'jsonPath' ? target.path : '';
  switch (type) {
    case 'header':
      return { type, name: text };
    case 'jsonPath':
      return { type, path: text || '$.' };
    default:
      return { type };
  }
}
