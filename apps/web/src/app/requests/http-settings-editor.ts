import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import type { HttpSettings } from '@restapi/shared';

/**
 * Réglages HTTP. Avec `inherited` (une Requête), chaque réglage peut reprendre celui de la
 * Collection ; sans (une Collection), tous les réglages sont fixés.
 */
@Component({
  selector: 'app-http-settings-editor',
  imports: [MatFormFieldModule, MatInputModule, MatSelectModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fields">
      <mat-form-field>
        <mat-label>{{ 'settings.timeout' | transloco }}</mat-label>
        <input
          matInput
          type="number"
          min="1"
          max="600000"
          [value]="settings().timeoutMs ?? ''"
          [placeholder]="
            inherited() ? ('settings.inherited' | transloco: { value: inherited()!.timeoutMs }) : ''
          "
          (input)="setTimeout($any($event.target).value)"
        />
        <span matTextSuffix>ms</span>
      </mat-form-field>

      @for (key of booleanKeys; track key) {
        <mat-form-field>
          <mat-label>{{ 'settings.' + key | transloco }}</mat-label>
          <mat-select [value]="choice(key)" (valueChange)="setChoice(key, $event)">
            @if (inherited(); as base) {
              <mat-option value="inherit">
                {{
                  'settings.inheritChoice'
                    | transloco: { value: ((base[key] ? 'common.yes' : 'common.no') | transloco) }
                }}
              </mat-option>
            }
            <mat-option value="yes">{{ 'common.yes' | transloco }}</mat-option>
            <mat-option value="no">{{ 'common.no' | transloco }}</mat-option>
          </mat-select>
        </mat-form-field>
      }
    </div>
  `,
  styles: `
    .fields {
      display: flex;
      flex-wrap: wrap;
      gap: 0 12px;
    }
    mat-form-field {
      width: 260px;
    }
  `,
})
export class HttpSettingsEditor {
  readonly settings = input.required<Partial<HttpSettings>>();
  /** Réglages de la Collection, quand on édite une Requête. */
  readonly inherited = input<HttpSettings | null>(null);
  readonly settingsChange = output<Partial<HttpSettings>>();

  protected readonly booleanKeys = ['followRedirects', 'ignoreTlsErrors'] as const;

  protected choice(key: (typeof this.booleanKeys)[number]): 'inherit' | 'yes' | 'no' {
    const value = this.settings()[key];
    if (value === undefined) return this.inherited() ? 'inherit' : 'no';
    return value ? 'yes' : 'no';
  }

  protected setChoice(
    key: (typeof this.booleanKeys)[number],
    choice: 'inherit' | 'yes' | 'no',
  ): void {
    const next = { ...this.settings() };
    if (choice === 'inherit') delete next[key];
    else next[key] = choice === 'yes';
    this.settingsChange.emit(next);
  }

  protected setTimeout(raw: string): void {
    const next = { ...this.settings() };
    const value = Number(raw);
    if (raw === '' || !Number.isInteger(value) || value < 1) delete next.timeoutMs;
    else next.timeoutMs = value;
    this.settingsChange.emit(next);
  }
}
