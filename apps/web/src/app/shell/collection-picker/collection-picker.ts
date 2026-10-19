import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { CollectionTransfer } from '../../core/collection-transfer';
import { Notifier } from '../../core/notifier';
import { WorkspaceStore } from '../../core/workspace.store';
import { Dialogs } from '../../shared/ui/dialogs';

/** Choix de la Collection ouverte, et création d'une Collection. */
@Component({
  selector: 'app-collection-picker',
  imports: [
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatMenuModule,
    RouterLink,
    TranslocoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      mat-button
      [matMenuTriggerFor]="menu"
      [attr.aria-label]="'shell.collection.label' | transloco"
    >
      <mat-icon>folder_special</mat-icon>
      <span class="name">{{
        store.tree()?.collection?.name ?? ('shell.collection.choose' | transloco)
      }}</span>
      <mat-icon iconPositionEnd>arrow_drop_down</mat-icon>
    </button>
    <mat-menu #menu="matMenu">
      @for (c of store.collections(); track c.id) {
        <a mat-menu-item [routerLink]="['/collections', c.id]">
          <mat-icon [class.hidden]="c.id !== store.collectionId()">check</mat-icon>
          <span>{{ c.name }}</span>
        </a>
      }
      @if (store.collections().length) {
        <mat-divider />
      }
      <button mat-menu-item (click)="create()">
        <mat-icon>add</mat-icon>
        <span>{{ 'shell.collection.new' | transloco }}</span>
      </button>
      <button mat-menu-item (click)="transfer.pickAndImport()">
        <mat-icon>upload_file</mat-icon>
        <span>{{ 'transfer.import' | transloco }}</span>
      </button>
      <a mat-menu-item routerLink="/">
        <mat-icon>apps</mat-icon>
        <span>{{ 'shell.collection.all' | transloco }}</span>
      </a>
    </mat-menu>
  `,
  styles: `
    .name {
      max-width: 22ch;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: inline-block;
      vertical-align: middle;
    }
    .hidden {
      visibility: hidden;
    }
  `,
})
export class CollectionPicker {
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
