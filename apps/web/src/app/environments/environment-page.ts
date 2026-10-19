import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import type { VariableInput } from '@restapi/shared';
import { ApiClient } from '../core/api-client';
import { Notifier } from '../core/notifier';
import { WorkspaceStore } from '../core/workspace.store';
import { VariablesEditor, type VariablesChange } from '../shared/variables/variables-editor';
import { unchangedInputs } from '../shared/variables/variables-model';

/** Édition d'un Environnement : nom et Variables. */
@Component({
  selector: 'app-environment-page',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    TranslocoPipe,
    VariablesEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../shared/ui/page.scss',
  template: `
    @if (environment.value(); as env) {
      <div class="title-row">
        <h1>{{ 'environmentPage.title' | transloco }}</h1>
        @if (isActive()) {
          <span class="active-chip">
            <mat-icon>radio_button_checked</mat-icon>
            {{ 'environmentPage.active' | transloco }}
          </span>
        } @else {
          <button mat-stroked-button (click)="store.selectEnvironment(env.id)">
            {{ 'environmentPage.activate' | transloco }}
          </button>
        }
      </div>
      <p class="hint">{{ 'environmentPage.hint' | transloco }}</p>

      <mat-form-field class="name-field">
        <mat-label>{{ 'environmentPage.name' | transloco }}</mat-label>
        <input
          matInput
          [value]="name()"
          (input)="setName($any($event.target).value)"
          maxlength="200"
        />
      </mat-form-field>

      <h2>{{ 'variables.title' | transloco }}</h2>
      <app-variables-editor [variables]="env.variables" (changed)="onVariables($event)" />

      <div class="actions">
        <button mat-flat-button (click)="save()" [disabled]="!canSave()">
          {{ 'common.save' | transloco }}
        </button>
        @if (dirty()) {
          <span class="unsaved">{{ 'common.unsaved' | transloco }}</span>
        }
      </div>
    }
  `,
  styles: `
    .active-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-primary);
    }
  `,
})
export class EnvironmentPage {
  /** Paramètre de route. */
  readonly environmentId = input.required<string>();

  protected readonly store = inject(WorkspaceStore);
  private readonly api = inject(ApiClient);
  private readonly notifier = inject(Notifier);

  protected readonly environment = resource({
    params: () => ({ id: this.environmentId() }),
    loader: ({ params }) => this.api.getEnvironment(params.id),
  });

  protected readonly isActive = computed(() => this.store.environmentId() === this.environmentId());
  protected readonly name = signal('');
  private readonly variables = signal<VariableInput[] | null>(null);
  private readonly variablesValid = signal(true);
  protected readonly dirty = signal(false);
  protected readonly canSave = computed(
    () => this.dirty() && this.variablesValid() && this.name().trim() !== '',
  );

  constructor() {
    effect(() => {
      const env = this.environment.value();
      if (!env) return;
      this.name.set(env.name);
      this.variables.set(null);
      this.variablesValid.set(true);
      this.dirty.set(false);
    });
    effect(() => {
      const error = this.environment.error();
      if (error) this.notifier.error(error);
    });
  }

  protected setName(name: string): void {
    this.name.set(name);
    this.dirty.set(true);
  }

  protected onVariables(change: VariablesChange): void {
    this.variables.set(change.inputs);
    this.variablesValid.set(change.valid);
    this.dirty.set(true);
  }

  protected async save(): Promise<void> {
    const env = this.environment.value();
    if (!env) return;
    const variables = this.variables() ?? unchangedInputs(env.variables);
    try {
      const updated = await this.store.updateEnvironment(env.id, this.name().trim(), variables);
      this.environment.set(updated);
      this.notifier.success('environmentPage.saved');
    } catch (e) {
      this.notifier.error(e);
    }
  }
}
