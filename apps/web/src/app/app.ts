import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ApiStatus } from './shell/api-status/api-status';
import { LanguageSelector } from './shell/language-selector/language-selector';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    MatToolbarModule,
    MatIconModule,
    TranslocoPipe,
    ApiStatus,
    LanguageSelector,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar class="topbar">
      <mat-icon aria-hidden="true">hub</mat-icon>
      <span class="brand">{{ 'app.title' | transloco }}</span>
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
    }
    .brand {
      font: var(--mat-sys-title-large);
    }
    .spacer {
      flex: 1;
    }
    main {
      flex: 1;
      overflow: auto;
    }
  `,
})
export class App {}
