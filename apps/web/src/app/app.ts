import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { WorkspaceStore } from './core/workspace.store';
import { ApiStatus } from './shell/api-status/api-status';
import { CollectionPicker } from './shell/collection-picker/collection-picker';
import { EnvironmentSelector } from './shell/environment-selector/environment-selector';
import { LanguageSelector } from './shell/language-selector/language-selector';
import { LayoutState } from './shell/layout.state';

@Component({
  selector: 'app-root',
  imports: [
    RouterLink,
    RouterOutlet,
    MatButtonModule,
    MatIconModule,
    MatToolbarModule,
    MatTooltipModule,
    TranslocoPipe,
    ApiStatus,
    CollectionPicker,
    EnvironmentSelector,
    LanguageSelector,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar class="topbar">
      @if (store.tree()) {
        <button
          mat-icon-button
          (click)="layout.toggleSidebar()"
          [matTooltip]="'shell.toggleSidebar' | transloco"
          [attr.aria-label]="'shell.toggleSidebar' | transloco"
          [attr.aria-expanded]="layout.sidebarOpen()"
        >
          <mat-icon>menu</mat-icon>
        </button>
      }
      <a class="brand" routerLink="/">
        <mat-icon aria-hidden="true">hub</mat-icon>
        <span>{{ 'app.title' | transloco }}</span>
      </a>
      <app-collection-picker />
      @if (store.tree()) {
        <app-environment-selector />
      }
      <span class="spacer"></span>
      <app-api-status />
      <app-language-selector />
    </mat-toolbar>
    <main>
      <router-outlet />
    </main>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .topbar {
      gap: 8px;
      background: var(--mat-sys-surface-container);
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-right: 8px;
      font: var(--mat-sys-title-large);
      color: inherit;
      text-decoration: none;
    }
    .spacer {
      flex: 1;
    }
    main {
      flex: 1;
      min-height: 0;
      overflow: auto;
    }
  `,
})
export class App {
  protected readonly store = inject(WorkspaceStore);
  protected readonly layout = inject(LayoutState);
}
