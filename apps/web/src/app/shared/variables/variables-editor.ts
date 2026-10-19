import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import type { VariableInput, VariableView } from '@restapi/shared';
import { newRow, rowProblems, rowsFromViews, toInputs, type VariableRow } from './variables-model';

export interface VariablesChange {
  inputs: VariableInput[];
  valid: boolean;
}

/**
 * Édition d'une liste de Variables. La valeur d'une Variable secrète n'est jamais affichée :
 * un champ vide garde la valeur enregistrée.
 */
@Component({
  selector: 'app-variables-editor',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rows().length === 0) {
      <p class="empty">{{ 'variables.empty' | transloco }}</p>
    } @else {
      <div class="grid" role="table" [attr.aria-label]="'variables.title' | transloco">
        <div class="head" role="row">
          <span role="columnheader">{{ 'variables.name' | transloco }}</span>
          <span role="columnheader">{{ 'variables.value' | transloco }}</span>
          <span role="columnheader"
            ><span class="sr-only">{{ 'variables.secret' | transloco }}</span></span
          >
        </div>
        @for (row of rows(); track row.key) {
          @let problem = problems().get(row.key);
          <div class="row" role="row">
            <div role="cell">
              <input
                class="name"
                [value]="row.name"
                (input)="update(row.key, { name: $any($event.target).value })"
                [attr.aria-label]="'variables.name' | transloco"
                [attr.aria-invalid]="!!problem"
                spellcheck="false"
              />
              @if (problem) {
                <span class="problem">{{ 'variables.problems.' + problem | transloco }}</span>
              }
            </div>
            <div role="cell">
              <input
                [type]="row.secret ? 'password' : 'text'"
                [value]="row.value"
                (input)="update(row.key, { value: $any($event.target).value })"
                [placeholder]="placeholder(row) | transloco"
                [attr.aria-label]="'variables.value' | transloco"
                autocomplete="off"
                spellcheck="false"
              />
            </div>
            <div role="cell" class="actions">
              <button
                mat-icon-button
                type="button"
                [class.on]="row.secret"
                (click)="update(row.key, { secret: !row.secret })"
                [matTooltip]="
                  (row.secret ? 'variables.makePlain' : 'variables.makeSecret') | transloco
                "
                [attr.aria-label]="
                  (row.secret ? 'variables.makePlain' : 'variables.makeSecret') | transloco
                "
                [attr.aria-pressed]="row.secret"
              >
                <mat-icon>{{ row.secret ? 'lock' : 'lock_open' }}</mat-icon>
              </button>
              <button
                mat-icon-button
                type="button"
                (click)="remove(row.key)"
                [matTooltip]="'variables.remove' | transloco"
                [attr.aria-label]="'variables.remove' | transloco"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          </div>
        }
      </div>
    }
    <button mat-button type="button" (click)="add()">
      <mat-icon>add</mat-icon>
      {{ 'variables.add' | transloco }}
    </button>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: minmax(120px, 1fr) minmax(160px, 2fr) auto;
      gap: 4px 8px;
      margin-bottom: 8px;
    }
    .head,
    .row {
      display: contents;
    }
    .head span {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    input {
      box-sizing: border-box;
      width: 100%;
      padding: 8px;
      font: var(--mat-sys-body-medium);
      font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
      color: var(--mat-sys-on-surface);
      background: var(--mat-sys-surface-container-low);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 6px;
    }
    input:focus {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: -1px;
    }
    input[aria-invalid='true'] {
      border-color: var(--mat-sys-error);
    }
    .problem {
      display: block;
      margin-top: 2px;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-error);
    }
    .actions {
      display: flex;
      align-items: start;
    }
    .on {
      color: var(--mat-sys-primary);
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  `,
})
export class VariablesEditor {
  /** Variables enregistrées ; l'éditeur repart de zéro quand elles changent. */
  readonly variables = input.required<readonly VariableView[]>();
  readonly changed = output<VariablesChange>();

  protected readonly rows = signal<VariableRow[]>([]);
  protected readonly problems = computed(() => rowProblems(this.rows()));

  constructor() {
    effect(() => {
      const views = this.variables();
      untracked(() => this.rows.set(rowsFromViews(views)));
    });
  }

  protected placeholder(row: VariableRow): string {
    if (!row.secret) return '';
    return row.storedSecretName === row.name ? 'variables.keepSecret' : 'variables.noSecretValue';
  }

  protected add(): void {
    this.apply([...this.rows(), newRow()]);
  }

  protected remove(key: number): void {
    this.apply(this.rows().filter((r) => r.key !== key));
  }

  protected update(key: number, patch: Partial<Omit<VariableRow, 'key'>>): void {
    this.apply(this.rows().map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  private apply(rows: VariableRow[]): void {
    this.rows.set(rows);
    this.changed.emit({ inputs: toInputs(rows), valid: rowProblems(rows).size === 0 });
  }
}
