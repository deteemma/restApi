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
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { CollectionAuth, HttpSettings, RequestAuth, VariableInput } from '@restapi/shared';
import { ApiClient } from '../core/api-client';
import { CollectionTransfer } from '../core/collection-transfer';
import { Notifier } from '../core/notifier';
import { WorkspaceStore } from '../core/workspace.store';
import { AppDatePipe } from '../shared/ui/app-date.pipe';
import { Dialogs } from '../shared/ui/dialogs';
import { VariablesEditor, type VariablesChange } from '../shared/variables/variables-editor';
import { AuthEditor } from '../requests/auth-editor';
import { HttpSettingsEditor } from '../requests/http-settings-editor';

/** Réglages d'une Collection : nom et Variables par défaut. */
@Component({
  selector: 'app-collection-settings-page',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
    TranslocoPipe,
    AppDatePipe,
    VariablesEditor,
    AuthEditor,
    HttpSettingsEditor,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../shared/ui/page.scss',
  template: `
    @if (collection.value(); as c) {
      <h1>{{ 'collectionSettings.title' | transloco }}</h1>
      <p class="meta">
        {{ 'collectionSettings.updated' | transloco: { date: (c.updatedAt | appDate) } }}
      </p>

      <mat-form-field class="name-field">
        <mat-label>{{ 'collectionSettings.name' | transloco }}</mat-label>
        <input
          matInput
          [value]="name()"
          (input)="setName($any($event.target).value)"
          maxlength="200"
        />
      </mat-form-field>

      <h2>{{ 'variables.title' | transloco }}</h2>
      <p class="hint">{{ 'collectionSettings.variablesHint' | transloco }}</p>
      <app-variables-editor [variables]="c.variables" (changed)="onVariables($event)" />

      <h2>{{ 'collectionSettings.auth' | transloco }}</h2>
      <p class="hint">{{ 'collectionSettings.authHint' | transloco }}</p>
      <app-auth-editor [auth]="auth() ?? c.auth" (authChange)="setAuth($event)" />

      <h2>{{ 'collectionSettings.http' | transloco }}</h2>
      <app-http-settings-editor
        [settings]="settings() ?? c.settings"
        (settingsChange)="setSettings($event)"
      />

      <div class="actions">
        <button mat-flat-button (click)="save()" [disabled]="!canSave()">
          {{ 'common.save' | transloco }}
        </button>
        @if (dirty()) {
          <span class="unsaved">{{ 'common.unsaved' | transloco }}</span>
        }
        <span class="spacer"></span>
        <button
          mat-stroked-button
          (click)="transfer.export(c.id)"
          [matTooltip]="'transfer.exportHint' | transloco"
        >
          <mat-icon>download</mat-icon>
          {{ 'transfer.export' | transloco }}
        </button>
        <button mat-stroked-button class="danger" (click)="remove(c.id, c.name)">
          <mat-icon>delete</mat-icon>
          {{ 'collectionSettings.delete' | transloco }}
        </button>
      </div>
    }
  `,
})
export class CollectionSettingsPage {
  /** Paramètre de route (hérité de la route parente). */
  readonly collectionId = input.required<string>();

  private readonly api = inject(ApiClient);
  private readonly store = inject(WorkspaceStore);
  protected readonly transfer = inject(CollectionTransfer);
  private readonly notifier = inject(Notifier);
  private readonly dialogs = inject(Dialogs);
  private readonly router = inject(Router);

  protected readonly collection = resource({
    params: () => ({ id: this.collectionId() }),
    loader: ({ params }) => this.api.getCollection(params.id),
  });

  protected readonly name = signal('');
  private readonly variables = signal<VariableInput[] | null>(null);
  private readonly variablesValid = signal(true);
  protected readonly auth = signal<CollectionAuth | null>(null);
  protected readonly settings = signal<Partial<HttpSettings> | null>(null);
  protected readonly dirty = signal(false);
  protected readonly canSave = computed(
    () => this.dirty() && this.variablesValid() && this.name().trim() !== '',
  );

  constructor() {
    effect(() => {
      const c = this.collection.value();
      if (!c) return;
      this.name.set(c.name);
      this.variables.set(null);
      this.auth.set(null);
      this.settings.set(null);
      this.variablesValid.set(true);
      this.dirty.set(false);
    });
    effect(() => {
      const error = this.collection.error();
      if (error) this.notifier.error(error);
    });
  }

  protected setName(name: string): void {
    this.name.set(name);
    this.dirty.set(true);
  }

  protected setAuth(auth: RequestAuth): void {
    // Une Collection n'hérite de rien : l'éditeur ne propose pas « hériter ».
    if (auth.type === 'inherit') return;
    this.auth.set(auth);
    this.dirty.set(true);
  }

  protected setSettings(settings: Partial<HttpSettings>): void {
    this.settings.set(settings);
    this.dirty.set(true);
  }

  protected onVariables(change: VariablesChange): void {
    this.variables.set(change.inputs);
    this.variablesValid.set(change.valid);
    this.dirty.set(true);
  }

  protected async save(): Promise<void> {
    try {
      const variables = this.variables();
      const updated = await this.store.updateCollection(this.collectionId(), {
        name: this.name().trim(),
        ...(variables ? { variables } : {}),
        ...(this.auth() ? { auth: this.auth()! } : {}),
        ...(this.settings() ? { settings: this.settings()! } : {}),
      });
      this.collection.set(updated);
      this.notifier.success('collectionSettings.saved');
    } catch (e) {
      this.notifier.error(e);
    }
  }

  protected async remove(id: string, name: string): Promise<void> {
    const confirmed = await this.dialogs.confirm({
      title: 'dialogs.deleteTitle',
      titleParams: { name },
      message: 'dialogs.deleteCollectionMessage',
      confirm: 'common.delete',
    });
    if (!confirmed) return;
    try {
      await this.store.deleteCollection(id);
      await this.router.navigate(['/']);
    } catch (e) {
      this.notifier.error(e);
    }
  }
}
