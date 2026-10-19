import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
} from '@angular/core';
import { MatSidenavModule } from '@angular/material/sidenav';
import { Router, RouterOutlet } from '@angular/router';
import { Notifier } from '../core/notifier';
import { WorkspaceStore } from '../core/workspace.store';
import { LayoutState } from '../shell/layout.state';
import { CollectionTree } from './collection-tree/collection-tree';

/** Une Collection ouverte : arborescence à gauche, page de l'élément choisi au centre. */
@Component({
  selector: 'app-collection-layout',
  imports: [MatSidenavModule, RouterOutlet, CollectionTree],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-sidenav-container class="container">
      <mat-sidenav mode="side" [opened]="layout.sidebarOpen()" class="sidenav">
        <app-collection-tree />
      </mat-sidenav>
      <mat-sidenav-content>
        <router-outlet />
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: `
    :host,
    .container {
      display: block;
      height: 100%;
    }
    .sidenav {
      width: 300px;
      background: var(--mat-sys-surface-container-low);
      border-right: 1px solid var(--mat-sys-outline-variant);
    }
  `,
})
export class CollectionLayout {
  /** Paramètre de route. */
  readonly collectionId = input.required<string>();

  protected readonly layout = inject(LayoutState);
  private readonly store = inject(WorkspaceStore);
  private readonly notifier = inject(Notifier);
  private readonly router = inject(Router);

  constructor() {
    effect(() => {
      const id = this.collectionId();
      this.store.openCollection(id).catch(async (error) => {
        this.notifier.error(error);
        await this.router.navigate(['/']);
      });
    });
    inject(DestroyRef).onDestroy(() => this.store.closeCollection());
  }
}
