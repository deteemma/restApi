import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { VariableView } from '@restapi/shared';
import { translocoTesting } from '../../../testing/transloco-testing';
import { VariablesEditor, type VariablesChange } from './variables-editor';

@Component({
  imports: [VariablesEditor],
  template: `<app-variables-editor [variables]="variables()" (changed)="changes.push($event)" />`,
})
class Host {
  readonly variables = signal<VariableView[]>([
    { name: 'baseUrl', secret: false, value: 'https://api.test' },
    { name: 'token', secret: true, hasValue: true },
  ]);
  readonly changes: VariablesChange[] = [];
}

describe('VariablesEditor', () => {
  async function setup() {
    TestBed.configureTestingModule({ imports: [Host, translocoTesting()] });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const inputs = () => [...el.querySelectorAll<HTMLInputElement>('input')];
    const type = async (input: HTMLInputElement, value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    };
    return { fixture, el, host: fixture.componentInstance, inputs, type };
  }

  it("masque la valeur secrète et indique qu'un champ vide la conserve", async () => {
    const { inputs } = await setup();
    const [, plainValue, , secretValue] = inputs();
    expect(plainValue!.value).toBe('https://api.test');
    expect(secretValue!.type).toBe('password');
    expect(secretValue!.value).toBe('');
    expect(secretValue!.placeholder).toContain('laisser vide pour la conserver');
  });

  it('renvoie la Variable secrète sans valeur tant qu’on ne la ressaisit pas', async () => {
    const { inputs, type, host } = await setup();
    await type(inputs()[1]!, 'https://other.test');
    expect(host.changes.at(-1)).toEqual({
      valid: true,
      inputs: [
        { name: 'baseUrl', secret: false, value: 'https://other.test' },
        { name: 'token', secret: true },
      ],
    });

    await type(inputs()[3]!, 'nouveau-token');
    expect(host.changes.at(-1)?.inputs[1]).toEqual({
      name: 'token',
      secret: true,
      value: 'nouveau-token',
    });
  });

  it('signale un nom en double et rend la saisie invalide', async () => {
    const { inputs, type, host, el } = await setup();
    await type(inputs()[2]!, 'baseUrl');
    expect(host.changes.at(-1)?.valid).toBe(false);
    expect(el.textContent).toContain('Nom en double');
  });

  it('ajoute, rend secrète puis retire une Variable', async () => {
    const { el, fixture, host, inputs } = await setup();
    const button = (label: string, index = 0) =>
      [...el.querySelectorAll<HTMLButtonElement>('button')].filter(
        (b) => b.getAttribute('aria-label') === label || b.textContent?.includes(label),
      )[index]!;

    button('Ajouter une Variable').click();
    await fixture.whenStable();
    expect(inputs()).toHaveLength(6);

    button('Rendre la Variable secrète', 1).click(); // la 1re est baseUrl, la 2e la nouvelle ligne
    await fixture.whenStable();
    expect(inputs()[5]!.type).toBe('password');

    button('Retirer la Variable', 2).click();
    await fixture.whenStable();
    expect(inputs()).toHaveLength(4);
    expect(host.changes.at(-1)?.inputs.map((v) => v.name)).toEqual(['baseUrl', 'token']);
  });
});
