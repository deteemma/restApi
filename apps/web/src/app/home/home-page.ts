import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-home-page',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ 'home.title' | transloco }}</h1>
    <p>{{ 'home.subtitle' | transloco }}</p>
  `,
  styles: `
    :host {
      display: block;
      padding: 24px;
    }
    h1 {
      font: var(--mat-sys-headline-medium);
    }
  `,
})
export class HomePage {}
