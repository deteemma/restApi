import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import type { KeyValue } from '@restapi/shared';

/** Liste de paires nom/valeur activables : paramètres de query, en-têtes, champs de formulaire. */
@Component({
  selector: 'app-key-value-editor',
  imports: [MatButtonModule, MatCheckboxModule, MatIconModule, MatTooltipModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (items().length) {
      <div class="grid">
        @for (item of items(); track $index; let i = $index) {
          <mat-checkbox
            [checked]="item.enabled !== false"
            (change)="patch(i, { enabled: $event.checked })"
            [attr.aria-label]="'keyValue.enabled' | transloco"
            [matTooltip]="'keyValue.enabled' | transloco"
          />
          <input
            [value]="item.name"
            (input)="patch(i, { name: $any($event.target).value })"
            [placeholder]="namePlaceholder() | transloco"
            [attr.aria-label]="'keyValue.name' | transloco"
            [class.disabled]="item.enabled === false"
            spellcheck="false"
          />
          <input
            [value]="item.value"
            (input)="patch(i, { value: $any($event.target).value })"
            [placeholder]="'keyValue.value' | transloco"
            [attr.aria-label]="'keyValue.value' | transloco"
            [class.disabled]="item.enabled === false"
            spellcheck="false"
          />
          <button
            mat-icon-button
            type="button"
            (click)="remove(i)"
            [attr.aria-label]="'keyValue.remove' | transloco"
            [matTooltip]="'keyValue.remove' | transloco"
          >
            <mat-icon>delete</mat-icon>
          </button>
        }
      </div>
    }
    <button mat-button type="button" (click)="add()">
      <mat-icon>add</mat-icon>
      {{ addLabel() | transloco }}
    </button>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: auto minmax(120px, 1fr) minmax(160px, 2fr) auto;
      gap: 4px 8px;
      align-items: center;
      margin-bottom: 4px;
    }
    input {
      box-sizing: border-box;
      width: 100%;
      padding: 7px 8px;
      font:
        13px/1.4 ui-monospace,
        'Cascadia Code',
        Consolas,
        monospace;
      color: var(--mat-sys-on-surface);
      background: var(--mat-sys-surface-container-low);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 6px;
    }
    input:focus {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: -1px;
    }
    .disabled {
      opacity: 0.55;
      text-decoration: line-through;
    }
  `,
})
export class KeyValueEditor {
  readonly items = input.required<readonly KeyValue[]>();
  readonly namePlaceholder = input('keyValue.name');
  readonly addLabel = input('keyValue.add');
  readonly itemsChange = output<KeyValue[]>();

  protected add(): void {
    this.itemsChange.emit([...this.items(), { name: '', value: '' }]);
  }

  protected remove(index: number): void {
    this.itemsChange.emit(this.items().filter((_, i) => i !== index));
  }

  protected patch(index: number, change: Partial<KeyValue>): void {
    this.itemsChange.emit(
      this.items().map((item, i) => (i === index ? { ...item, ...change } : item)),
    );
  }
}
