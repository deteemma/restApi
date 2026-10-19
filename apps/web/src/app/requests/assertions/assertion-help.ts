import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { OPERATORS, TARGETS } from './assertion-catalog';
import { JsonPathCheatSheet } from './json-path-cheat-sheet';

/** Panneau d'aide : catalogue des cibles et des opérateurs, et aide-mémoire des chemins JSON. */
@Component({
  selector: 'app-assertion-help',
  imports: [TranslocoPipe, JsonPathCheatSheet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3>{{ 'assertions.help.title' | transloco }}</h3>
    <p>
      {{ 'assertions.help.intro' | transloco }} <code>{{ variableExample }}</code>
    </p>

    <h4>{{ 'assertions.help.targets' | transloco }}</h4>
    <dl>
      @for (t of targets; track t.type) {
        <dt>{{ 'assertions.targets.' + t.type + '.label' | transloco }}</dt>
        <dd>
          {{ 'assertions.targets.' + t.type + '.description' | transloco }}
          <code>{{ t.example }}</code>
        </dd>
      }
    </dl>

    <h4>{{ 'assertions.help.operators' | transloco }}</h4>
    <table>
      <thead>
        <tr>
          <th scope="col">{{ 'assertions.operator' | transloco }}</th>
          <th scope="col">{{ 'assertions.help.meaning' | transloco }}</th>
          <th scope="col">{{ 'assertions.help.example' | transloco }}</th>
        </tr>
      </thead>
      <tbody>
        @for (o of operators; track o.operator) {
          <tr>
            <th scope="row">{{ 'assertions.operators.' + o.operator + '.label' | transloco }}</th>
            <td>{{ 'assertions.operators.' + o.operator + '.description' | transloco }}</td>
            <td>
              <code>{{ o.example }}</code>
            </td>
          </tr>
        }
      </tbody>
    </table>

    <h4>{{ 'assertions.help.jsonPath' | transloco }}</h4>

    <app-json-path-cheat-sheet />
    <p class="note">{{ 'assertions.help.noAssertion' | transloco }}</p>
  `,
  styles: `
    :host {
      display: block;
      font: var(--mat-sys-body-small);
    }
    h3 {
      margin: 0 0 8px;
      font: var(--mat-sys-title-small);
    }
    h4 {
      margin: 16px 0 6px;
      font: var(--mat-sys-label-large);
    }
    dl {
      margin: 0;
    }
    dt {
      font-weight: 600;
    }
    dd {
      margin: 0 0 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th,
    td {
      padding: 4px 6px;
      text-align: start;
      vertical-align: top;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    thead th {
      font-weight: 600;
      color: var(--mat-sys-on-surface-variant);
    }
    code {
      font:
        12px ui-monospace,
        'Cascadia Code',
        Consolas,
        monospace;
      padding: 1px 4px;
      border-radius: 4px;
      background: var(--mat-sys-surface-container-high);
      white-space: nowrap;
    }
    .note {
      margin-top: 12px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class AssertionHelp {
  protected readonly targets = TARGETS;
  protected readonly operators = OPERATORS;
  protected readonly variableExample = '{{expectedName}}';
}
