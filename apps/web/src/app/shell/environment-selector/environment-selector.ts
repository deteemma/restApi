import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { WorkspaceStore } from '../../core/workspace.store';

/** Environnement utilisé pour les Envois et les Exécutions de la Collection ouverte. */
@Component({
  selector: 'app-environment-selector',
  imports: [MatFormFieldModule, MatIconModule, MatSelectModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic" class="field toolbar-field">
      <mat-icon matPrefix>dns</mat-icon>
      <mat-select
        [placeholder]="'shell.environment.none' | transloco"
        [value]="store.environmentId()"
        (valueChange)="store.selectEnvironment($event)"
        [aria-label]="'shell.environment.label' | transloco"
      >
        <mat-option [value]="null">{{ 'shell.environment.none' | transloco }}</mat-option>
        @for (env of store.tree()?.environments ?? []; track env.id) {
          <mat-option [value]="env.id">{{ env.name }}</mat-option>
        }
      </mat-select>
    </mat-form-field>
  `,
  styles: `
    .field {
      width: 250px;
    }
  `,
})
export class EnvironmentSelector {
  protected readonly store = inject(WorkspaceStore);
}
