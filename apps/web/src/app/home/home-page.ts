import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { CollectionTransfer } from '../core/collection-transfer';
import { Notifier } from '../core/notifier';
import { WorkspaceStore } from '../core/workspace.store';
import { AppDatePipe } from '../shared/ui/app-date.pipe';
import { Dialogs } from '../shared/ui/dialogs';

/** Accueil : liste des Collections. */
@Component({
  selector: 'app-home-page',
  imports: [MatButtonModule, MatIconModule, RouterLink, TranslocoPipe, AppDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ 'home.title' | transloco }}</h1>
    <p class="subtitle">{{ 'home.subtitle' | transloco }}</p>

    <div class="actions">
      <button mat-flat-button (click)="create()">
        <mat-icon>add</mat-icon>
        {{ 'home.create' | transloco }}
      </button>
      <button mat-stroked-button (click)="transfer.pickAndImport()">
        <mat-icon>upload_file</mat-icon>
        {{ 'transfer.import' | transloco }}
      </button>
    </div>

    @if (store.collections().length === 0) {
      <p class="empty">{{ 'home.empty' | transloco }}</p>
    } @else {
      <ul class="cards">
        @for (c of store.collections(); track c.id) {
          <li>
            <a class="card" [routerLink]="['/collections', c.id]">
              <mat-icon>folder_special</mat-icon>
              <span class="name">{{ c.name }}</span>
              <span class="meta">{{
                'home.updated' | transloco: { date: (c.updatedAt | appDate) }
              }}</span>
            </a>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    :host {
      display: block;
      max-width: 960px;
      margin: 0 auto;
      padding: 32px 16px;
    }
    h1 {
      margin: 0 0 4px;
      font: var(--mat-sys-headline-medium);
    }
    .subtitle {
      margin: 0 0 24px;
      color: var(--mat-sys-on-surface-variant);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
    }
    .cards {
      list-style: none;
      padding: 0;
      margin: 24px 0 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 12px;
    }
    .card {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 4px 12px;
      align-items: center;
      padding: 16px;
      border-radius: 12px;
      background: var(--mat-sys-surface-container);
      color: var(--mat-sys-on-surface);
      text-decoration: none;
    }
    .card:hover {
      background: var(--mat-sys-surface-container-high);
    }
    .card mat-icon {
      grid-row: span 2;
      color: var(--mat-sys-primary);
    }
    .name {
      font: var(--mat-sys-title-medium);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .meta {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class HomePage {
  protected readonly store = inject(WorkspaceStore);
  protected readonly transfer = inject(CollectionTransfer);
  private readonly dialogs = inject(Dialogs);
  private readonly notifier = inject(Notifier);
  private readonly router = inject(Router);

  constructor() {
    this.store.loadCollections().catch((e) => this.notifier.error(e));
  }

  protected async create(): Promise<void> {
    const name = await this.dialogs.askName({
      title: 'shell.collection.new',
      confirm: 'common.create',
    });
    if (!name) return;
    try {
      const created = await this.store.createCollection(name);
      await this.router.navigate(['/collections', created.id]);
    } catch (e) {
      this.notifier.error(e);
    }
  }
}
