import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { JSON_PATH_EXAMPLES } from './assertion-catalog';

/** Aide-mémoire des chemins JSON, partagé par l'aide des Assertions et celle des Extractions. */
@Component({
  selector: 'app-json-path-cheat-sheet',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <table>
      <tbody>
        @for (p of examples; track p.path) {
          <tr>
            <td>
              <code>{{ p.path }}</code>
            </td>
            <td>{{ 'assertions.jsonPath.' + p.key | transloco }}</td>
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    table {
      width: 100%;
      border-collapse: collapse;
      font: var(--mat-sys-body-small);
    }
    td {
      padding: 4px 6px;
      vertical-align: top;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
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
  `,
})
export class JsonPathCheatSheet {
  protected readonly examples = JSON_PATH_EXAMPLES;
}
