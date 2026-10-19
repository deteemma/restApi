import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Extraction, ExtractionResult, ExtractionSource } from '@restapi/shared';
import { JsonPathCheatSheet } from '../../requests/assertions/json-path-cheat-sheet';

type SourceType = ExtractionSource['type'];

/**
 * Extractions d'une Étape-requête : chaque ligne range une valeur de la réponse dans une
 * Variable d'exécution, utilisable par les Étapes suivantes avec {{nom}}.
 */
@Component({
  selector: 'app-extractions-editor',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatTooltipModule,
    TranslocoPipe,
    JsonPathCheatSheet,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <button mat-button type="button" (click)="add()">
        <mat-icon>add</mat-icon>
        {{ 'extractions.add' | transloco }}
      </button>
      <button
        mat-button
        type="button"
        (click)="evaluate.emit()"
        [disabled]="extractions().length === 0"
        [matTooltip]="'extractions.evaluateHint' | transloco"
      >
        <mat-icon>fact_check</mat-icon>
        {{ 'assertions.evaluate' | transloco }}
      </button>
      <span class="spacer"></span>
      <button
        mat-button
        type="button"
        (click)="helpOpen.set(!helpOpen())"
        [attr.aria-expanded]="helpOpen()"
      >
        <mat-icon>help_outline</mat-icon>
        {{ 'assertions.help.toggle' | transloco }}
      </button>
    </div>

    @if (helpOpen()) {
      <aside class="help">
        <p>{{ 'extractions.help' | transloco }}</p>
        <app-json-path-cheat-sheet />
      </aside>
    }

    @if (extractions().length === 0) {
      <p class="empty">{{ 'extractions.empty' | transloco }}</p>
    }
    @for (x of extractions(); track $index; let i = $index) {
      @let result = resultFor(i);
      <div
        class="row"
        [class.passed]="result && result.value !== undefined"
        [class.failed]="result && result.value === undefined"
      >
        <input
          class="code"
          [value]="x.variable"
          (input)="patch(i, { variable: $any($event.target).value })"
          [placeholder]="'extractions.variable' | transloco"
          [attr.aria-label]="'extractions.variable' | transloco"
          spellcheck="false"
        />
        <span class="arrow" aria-hidden="true">←</span>
        <mat-select
          [value]="x.source.type"
          (valueChange)="setSource(i, $event)"
          [aria-label]="'extractions.source' | transloco"
        >
          @for (t of sourceTypes; track t) {
            <mat-option [value]="t">{{
              'assertions.targets.' + t + '.label' | transloco
            }}</mat-option>
          }
        </mat-select>
        @if (x.source.type === 'status') {
          <span></span>
        } @else {
          <input
            class="code"
            [value]="x.source.type === 'header' ? x.source.name : x.source.path"
            (input)="setSourceText(i, $any($event.target).value)"
            [placeholder]="x.source.type === 'header' ? 'Location' : '$.id'"
            [attr.aria-label]="'assertions.targets.' + x.source.type + '.label' | transloco"
            spellcheck="false"
          />
        }
        <button
          mat-icon-button
          type="button"
          (click)="remove(i)"
          [attr.aria-label]="'extractions.remove' | transloco"
          [matTooltip]="'extractions.remove' | transloco"
        >
          <mat-icon>delete</mat-icon>
        </button>
        @if (result) {
          <div class="result" role="status">
            @if (result.value !== undefined) {
              <mat-icon>check_circle</mat-icon>
              <code>{{ x.variable }} = {{ result.value }}</code>
            } @else {
              <mat-icon>cancel</mat-icon>
              {{ 'assertions.notFound' | transloco }}
            }
          </div>
        }
      </div>
    }
  `,
  styles: `
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      margin-bottom: 8px;
    }
    .spacer {
      flex: 1;
    }
    .help {
      padding: 8px 12px;
      margin-bottom: 8px;
      border-radius: 12px;
      background: var(--mat-sys-surface-container);
      font: var(--mat-sys-body-small);
    }
    .empty {
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .row {
      display: grid;
      grid-template-columns: minmax(80px, 1fr) auto minmax(110px, 140px) minmax(80px, 1fr) auto;
      gap: 4px 8px;
      align-items: center;
      padding: 4px 6px;
      margin-bottom: 4px;
      border-left: 3px solid transparent;
      border-radius: 6px;
    }
    .row.passed {
      border-left-color: light-dark(#1b7f3b, #6fdc8c);
    }
    .row.failed {
      border-left-color: var(--mat-sys-error);
    }
    mat-select,
    input {
      box-sizing: border-box;
      width: 100%;
      padding: 7px 8px;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface);
      background: var(--mat-sys-surface-container-low);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 6px;
    }
    .code {
      font:
        13px/1.4 ui-monospace,
        'Cascadia Code',
        Consolas,
        monospace;
    }
    .arrow {
      color: var(--mat-sys-on-surface-variant);
    }
    .result {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 6px;
      font: var(--mat-sys-body-small);
      word-break: break-all;
    }
    .result mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .passed .result mat-icon {
      color: light-dark(#1b7f3b, #6fdc8c);
    }
    .failed .result mat-icon {
      color: var(--mat-sys-error);
    }
  `,
})
export class ExtractionsEditor {
  readonly extractions = input.required<readonly Extraction[]>();
  readonly evaluation = input<readonly ExtractionResult[] | null>(null);
  readonly extractionsChange = output<Extraction[]>();
  readonly evaluate = output<void>();

  protected readonly sourceTypes: SourceType[] = ['jsonPath', 'header', 'status'];
  protected readonly helpOpen = signal(false);

  protected add(): void {
    this.emit([
      ...this.extractions(),
      { variable: '', source: { type: 'jsonPath', path: '$.id' } },
    ]);
  }

  protected remove(index: number): void {
    this.emit(this.extractions().filter((_, i) => i !== index));
  }

  protected patch(index: number, change: Partial<Extraction>): void {
    this.emit(this.extractions().map((x, i) => (i === index ? { ...x, ...change } : x)));
  }

  protected setSource(index: number, type: SourceType): void {
    const source: ExtractionSource =
      type === 'status' ? { type } : type === 'header' ? { type, name: '' } : { type, path: '$.' };
    this.patch(index, { source });
  }

  protected setSourceText(index: number, text: string): void {
    const source = this.extractions()[index]?.source;
    if (source?.type === 'header') this.patch(index, { source: { type: 'header', name: text } });
    if (source?.type === 'jsonPath')
      this.patch(index, { source: { type: 'jsonPath', path: text } });
  }

  /** Résultat de la dernière évaluation, s'il correspond toujours à cette Extraction. */
  protected resultFor(index: number): ExtractionResult | null {
    const result = this.evaluation()?.[index];
    const extraction = this.extractions()[index];
    if (!result || !extraction) return null;
    return JSON.stringify(result.extraction) === JSON.stringify(extraction) ? result : null;
  }

  private emit(extractions: Extraction[]): void {
    this.extractionsChange.emit(extractions);
  }
}
