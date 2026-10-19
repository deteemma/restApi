import type { RequestDto } from '@restapi/shared';
import { retarget } from './assertions/assertion-catalog';
import { changeBodyType, draftFrom, prettyJson, sameDraft } from './request-draft';

const dto: RequestDto = {
  id: 'r1',
  collectionId: 'c1',
  folderId: null,
  name: 'Créer',
  method: 'POST',
  url: '{{baseUrl}}/items',
  query: [],
  headers: [],
  body: { type: 'json', content: '{"a":1}' },
  auth: { type: 'inherit' },
  assertions: [],
};

describe('brouillon de Requête', () => {
  it('retire les identifiants et compare par contenu', () => {
    const draft = draftFrom(dto);
    expect(draft).not.toHaveProperty('id');
    expect(sameDraft(draft, { ...draft })).toBe(true);
    expect(sameDraft(draft, { ...draft, url: 'x' })).toBe(false);
    expect(sameDraft(draft, { ...draft, settings: {} })).toBe(true);
  });

  it('change le type du corps en gardant le texte', () => {
    expect(changeBodyType({ type: 'json', content: '{}' }, 'text')).toEqual({
      type: 'text',
      content: '{}',
    });
    expect(changeBodyType({ type: 'json', content: '{}' }, 'form')).toEqual({
      type: 'form',
      fields: [],
    });
    expect(changeBodyType({ type: 'none' }, 'xml')).toEqual({ type: 'xml', content: '' });
  });

  it('indente du JSON, et refuse ce qui n’en est pas', () => {
    expect(prettyJson('{"a":[1]}')).toBe('{\n  "a": [\n    1\n  ]\n}');
    expect(prettyJson('<xml/>')).toBeNull();
  });

  it("garde le nom ou le chemin quand on change le type de cible d'une Assertion", () => {
    expect(retarget({ type: 'header', name: 'X-Id' }, 'jsonPath')).toEqual({
      type: 'jsonPath',
      path: 'X-Id',
    });
    expect(retarget({ type: 'status' }, 'jsonPath')).toEqual({ type: 'jsonPath', path: '$.' });
    expect(retarget({ type: 'jsonPath', path: '$.a' }, 'duration')).toEqual({ type: 'duration' });
  });
});
