import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { HttpMethod } from '@restapi/shared';

/** Méthode HTTP, avec une couleur par méthode (lisible en thème clair comme sombre). */
@Component({
  selector: 'app-method-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ method() }}`,
  host: { '[class]': '"badge " + method().toLowerCase()' },
  styles: `
    :host {
      display: inline-block;
      min-width: 3.6em;
      font: var(--mat-sys-label-small);
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    :host(.get) {
      color: light-dark(#1b7f3b, #6fdc8c);
    }
    :host(.post) {
      color: light-dark(#0b5cad, #78b7ff);
    }
    :host(.put) {
      color: light-dark(#a35a00, #ffb95c);
    }
    :host(.patch) {
      color: light-dark(#7438b0, #cf9bff);
    }
    :host(.delete) {
      color: light-dark(#b3261e, #ff8a80);
    }
    :host(.head),
    :host(.options) {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class MethodBadge {
  readonly method = input.required<HttpMethod>();
}
