import type { RequestBody, RequestDto, RequestInput } from '@restapi/shared';

export type BodyType = RequestBody['type'];

/** Le brouillon de l'éditeur : la Requête enregistrée, sans ses identifiants. */
export function draftFrom(request: RequestDto): RequestInput {
  const { id: _id, collectionId: _collectionId, ...draft } = request;
  return draft;
}

/** Vrai si deux brouillons sont identiques (comparaison de leur contenu). */
export function sameDraft(a: RequestInput, b: RequestInput): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function normalize(draft: RequestInput): RequestInput {
  // Ordre des clés stable, et `settings` vide équivalent à absent.
  const { settings, ...rest } = draft;
  const sorted = Object.fromEntries(Object.entries(rest).sort(([a], [b]) => a.localeCompare(b)));
  return (
    settings && Object.keys(settings).length > 0 ? { ...sorted, settings } : sorted
  ) as RequestInput;
}

/** Change le type du corps en gardant le contenu quand c'est possible. */
export function changeBodyType(body: RequestBody, type: BodyType): RequestBody {
  if (body.type === type) return body;
  const content =
    body.type === 'json' || body.type === 'text' || body.type === 'xml' ? body.content : '';
  switch (type) {
    case 'none':
      return { type: 'none' };
    case 'form':
      return { type: 'form', fields: [] };
    case 'json':
    case 'text':
    case 'xml':
      return { type, content };
  }
}

/** JSON indenté, ou null si le texte n'est pas du JSON. */
export function prettyJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}
