import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type * as Monaco from 'monaco-editor';
import { loadMonaco, type MonacoApi } from './monaco-loader';

export type CodeLanguage = 'json' | 'xml' | 'plaintext';

/**
 * Éditeur de code (Monaco). Une zone de texte simple le remplace pendant son chargement,
 * ou s'il ne peut pas être chargé.
 */
@Component({
  selector: 'app-code-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #host class="host" [class.hidden]="!ready()"></div>
    @if (!ready()) {
      <textarea
        class="fallback"
        [value]="value()"
        [readOnly]="readOnly()"
        [attr.aria-label]="ariaLabel()"
        (input)="valueChange.emit($any($event.target).value)"
        spellcheck="false"
      ></textarea>
    }
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      min-height: 160px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      overflow: hidden;
    }
    .host {
      position: absolute;
      inset: 0;
    }
    .hidden {
      visibility: hidden;
    }
    .fallback {
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      min-height: 160px;
      padding: 8px;
      border: 0;
      resize: vertical;
      font:
        13px/1.5 ui-monospace,
        'Cascadia Code',
        Consolas,
        monospace;
      color: var(--mat-sys-on-surface);
      background: var(--mat-sys-surface-container-lowest);
    }
  `,
})
export class CodeEditor {
  readonly value = input('');
  readonly language = input<CodeLanguage>('plaintext');
  readonly readOnly = input(false);
  readonly ariaLabel = input('');
  readonly valueChange = output<string>();

  protected readonly ready = signal(false);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private editor: Monaco.editor.IStandaloneCodeEditor | null = null;
  private monaco: MonacoApi | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)');
    const theme = () => (dark?.matches ? 'vs-dark' : 'vs');

    afterNextRender(() => {
      loadMonaco()
        .then((monaco) => {
          if (destroyRef.destroyed) return;
          this.monaco = monaco;
          this.editor = monaco.editor.create(this.host().nativeElement, {
            value: this.value(),
            language: this.language(),
            readOnly: this.readOnly(),
            theme: theme(),
            automaticLayout: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 13,
            tabSize: 2,
            wordWrap: 'on',
            ariaLabel: this.ariaLabel(),
          });
          this.editor.onDidChangeModelContent(() => {
            const text = this.editor!.getValue();
            if (text !== this.value()) this.valueChange.emit(text);
          });
          this.ready.set(true);
        })
        .catch(() => {
          // La zone de texte reste en place.
        });
    });

    // Valeur ou langue changées de l'extérieur (sans écraser la frappe en cours).
    effect(() => {
      const value = this.value();
      const language = this.language();
      const readOnly = this.readOnly();
      if (!this.editor || !this.monaco) return;
      const model = this.editor.getModel();
      if (model && model.getValue() !== value) model.setValue(value);
      if (model) this.monaco.editor.setModelLanguage(model, language);
      this.editor.updateOptions({ readOnly });
    });

    const onScheme = () => this.monaco?.editor.setTheme(theme());
    dark?.addEventListener('change', onScheme);
    destroyRef.onDestroy(() => {
      dark?.removeEventListener('change', onScheme);
      this.editor?.getModel()?.dispose();
      this.editor?.dispose();
    });
  }
}
