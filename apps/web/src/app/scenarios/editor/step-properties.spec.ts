import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { GroupStep, RequestStep, Step } from '@restapi/shared';
import { translocoTesting } from '../../../testing/transloco-testing';
import { StepProperties } from './step-properties';

describe('StepProperties', () => {
  async function setup(step: Step) {
    TestBed.configureTestingModule({
      imports: [StepProperties, translocoTesting()],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(StepProperties);
    fixture.componentRef.setInput('step', step);
    const changes: Step[] = [];
    // L'hôte réinjecte l'Étape modifiée, comme le fait la page du Scénario.
    fixture.componentInstance.stepChange.subscribe((s) => {
      changes.push(s);
      fixture.componentRef.setInput('step', s);
    });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const button = (text: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        b.textContent?.includes(text),
      )!;
    return { fixture, el, changes, button };
  }

  const reqStep: RequestStep = { id: 's1', type: 'request', requestId: 'r1', extractions: [] };

  it("garde une Variable de Surcharge ajoutée tant qu'elle n'a pas de nom, puis l'enregistre", async () => {
    const { fixture, el, changes, button } = await setup(reqStep);
    button('Ajouter une Variable').click();
    await fixture.whenStable();
    const [name, value] = el.querySelectorAll<HTMLInputElement>(
      'app-key-value-editor input:not([type=checkbox])',
    );
    expect(name).toBeDefined();

    name!.value = 'page';
    name!.dispatchEvent(new Event('input'));
    await fixture.whenStable(); // comme entre deux frappes réelles
    value!.value = '2';
    value!.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect((changes.at(-1) as RequestStep).overrides).toEqual({ variables: { page: '2' } });
    expect(el.querySelectorAll('app-key-value-editor input:not([type=checkbox])')).toHaveLength(2);
  });

  it('ajoute une Extraction', async () => {
    const { fixture, changes, button } = await setup(reqStep);
    button('Ajouter une Extraction').click();
    await fixture.whenStable();
    expect((changes.at(-1) as RequestStep).extractions).toEqual([
      { variable: '', source: { type: 'jsonPath', path: '$.id' } },
    ]);
  });

  it("règle la concurrence d'un Groupe parallèle, et revient à la valeur par défaut si vide", async () => {
    const group: GroupStep = { id: 'g', type: 'group', mode: 'parallel', steps: [] };
    const { fixture, el, changes } = await setup(group);
    const input = el.querySelector<HTMLInputElement>('input[type=number]')!;
    input.value = '4';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect((changes.at(-1) as GroupStep).maxConcurrency).toBe(4);

    input.value = '';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(changes.at(-1)).not.toHaveProperty('maxConcurrency');
  });
});
