import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Assertion, AssertionEvaluation } from '@restapi/shared';
import { translocoTesting } from '../../../testing/transloco-testing';
import { AssertionsEditor } from './assertions-editor';

@Component({
  imports: [AssertionsEditor],
  template: `
    <app-assertions-editor
      [assertions]="assertions()"
      (assertionsChange)="assertions.set($event)"
      [evaluation]="evaluation()"
      [canEvaluate]="canEvaluate()"
      (evaluate)="evaluations = evaluations + 1"
    />
  `,
})
class Host {
  readonly assertions = signal<Assertion[]>([
    { target: { type: 'status' }, operator: 'equals', expected: '201' },
    { target: { type: 'jsonPath', path: '$.id' }, operator: 'exists' },
  ]);
  readonly evaluation = signal<AssertionEvaluation[] | null>(null);
  readonly canEvaluate = signal(true);
  evaluations = 0;
}

describe('AssertionsEditor', () => {
  async function setup() {
    TestBed.configureTestingModule({ imports: [Host, translocoTesting()] });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const button = (text: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        b.textContent?.includes(text),
      )!;
    return { fixture, el, host: fixture.componentInstance, button };
  }

  it("n'affiche pas de valeur attendue pour « existe »", async () => {
    const { el } = await setup();
    const rows = el.querySelectorAll('.row');
    expect(rows[0]!.querySelectorAll('input')).toHaveLength(1); // valeur attendue
    expect(rows[1]!.querySelectorAll('input')).toHaveLength(1); // chemin JSON seulement
    expect((rows[1]!.querySelector('input') as HTMLInputElement).value).toBe('$.id');
  });

  it('ajoute une Assertion « statut égal à 200 » et en retire une', async () => {
    const { host, fixture, button, el } = await setup();
    button('Ajouter une Assertion').click();
    await fixture.whenStable();
    expect(host.assertions().at(-1)).toEqual({
      target: { type: 'status' },
      operator: 'equals',
      expected: '200',
    });

    el.querySelector<HTMLButtonElement>('.row button[aria-label="Retirer l\'Assertion"]')!.click();
    await fixture.whenStable();
    expect(host.assertions()).toHaveLength(2);
    expect(host.assertions()[0]!.target.type).toBe('jsonPath');
  });

  it('demande une évaluation, et montre la valeur trouvée pour chaque Assertion', async () => {
    const { host, fixture, button, el } = await setup();
    button('Évaluer').click();
    expect(host.evaluations).toBe(1);

    host.evaluation.set([
      { assertion: host.assertions()[0]!, passed: false, actual: 404, expected: '201' },
      { assertion: host.assertions()[1]!, passed: true, actual: 7 },
    ]);
    await fixture.whenStable();
    const rows = el.querySelectorAll('.row');
    expect(rows[0]!.classList).toContain('failed');
    expect(rows[0]!.textContent).toContain('404');
    expect(rows[1]!.classList).toContain('passed');
  });

  it("n'affiche plus un résultat devenu obsolète après modification de l'Assertion", async () => {
    const { host, fixture, el } = await setup();
    host.evaluation.set([{ assertion: host.assertions()[0]!, passed: true, actual: 201 }]);
    await fixture.whenStable();
    expect(el.querySelector('.row.passed')).not.toBeNull();

    const expected = el.querySelectorAll<HTMLInputElement>('.row')[0]!.querySelector('input')!;
    expected.value = '200';
    expected.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el.querySelector('.row.passed')).toBeNull();
  });

  it("désactive l'évaluation sans réponse, et ouvre le panneau d'aide", async () => {
    const { host, fixture, button, el } = await setup();
    host.canEvaluate.set(false);
    await fixture.whenStable();
    expect(button('Évaluer').disabled).toBe(true);

    button('Aide').click();
    await fixture.whenStable();
    const help = el.querySelector('#assertion-help')!;
    expect(help.textContent).toContain('correspond à (regex)');
    expect(help.textContent).toContain('$.items[*].id');
    expect(help.textContent).toContain('{{expectedName}}');
  });
});
