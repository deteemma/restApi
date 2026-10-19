import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import type { KeyValue, RunInput } from '@restapi/shared';
import { KeyValueEditor } from '../../shared/key-value/key-value-editor';

export interface LaunchDialogData {
  scenarioName: string;
  environments: { id: string; name: string }[];
  environmentId: string | null;
}

/** Lancement d'une Exécution : Environnement et Paramètres de lancement. */
@Component({
  selector: 'app-launch-dialog',
  imports: [MatButtonModule, MatDialogModule, MatSelectModule, TranslocoPipe, KeyValueEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>
      {{ 'scenarioRun.launchTitle' | transloco: { name: data.scenarioName } }}
    </h2>
    <mat-dialog-content>
      <div class="field">
        <span>{{ 'shell.environment.label' | transloco }}</span>
        <mat-select
          [aria-label]="'shell.environment.label' | transloco"
          [value]="environmentId()"
          (valueChange)="environmentId.set($event)"
        >
          <mat-option [value]="null">{{ 'shell.environment.none' | transloco }}</mat-option>
          @for (env of data.environments; track env.id) {
            <mat-option [value]="env.id">{{ env.name }}</mat-option>
          }
        </mat-select>
      </div>
      <h3>{{ 'scenarioRun.parameters' | transloco }}</h3>
      <p class="hint">{{ 'scenarioRun.parametersHint' | transloco }}</p>
      <app-key-value-editor
        [items]="parameters()"
        (itemsChange)="parameters.set($event)"
        addLabel="scenarioRun.addParameter"
      />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
      <button mat-flat-button (click)="launch()" cdkFocusInitial>
        {{ 'scenarioRun.launch' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content {
      width: min(560px, 80vw);
    }
    .field {
      display: grid;
      gap: 4px;
      max-width: 320px;
    }
    .field span {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    mat-select {
      padding: 8px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 6px;
    }
    h3 {
      margin: 20px 0 4px;
      font: var(--mat-sys-title-small);
    }
    .hint {
      margin: 0 0 8px;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class LaunchDialog {
  protected readonly data = inject<LaunchDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<LaunchDialog, RunInput>);

  protected readonly environmentId = signal(this.data.environmentId);
  protected readonly parameters = signal<KeyValue[]>([]);

  protected launch(): void {
    const parameters = Object.fromEntries(
      this.parameters()
        .filter((p) => p.name && p.enabled !== false)
        .map((p) => [p.name, p.value]),
    );
    this.ref.close({ environmentId: this.environmentId(), parameters });
  }
}
