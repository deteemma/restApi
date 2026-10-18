import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../i18n/language.service';
import { LANGUAGES, type LanguageCode } from '../../i18n/languages';

/** Bouton « globe » qui ouvre la liste des langues. Le changement se fait sans rechargement. */
@Component({
  selector: 'app-language-selector',
  imports: [MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      mat-button
      [matMenuTriggerFor]="menu"
      [matTooltip]="'shell.language.change' | transloco"
      [attr.aria-label]="'shell.language.change' | transloco"
    >
      <mat-icon>language</mat-icon>
      <span class="code">{{ language.current() }}</span>
      <mat-icon iconPositionEnd>arrow_drop_down</mat-icon>
    </button>
    <mat-menu #menu="matMenu" xPosition="before">
      @for (lang of languages; track lang.code) {
        <button
          mat-menu-item
          role="menuitemradio"
          [attr.aria-checked]="lang.code === language.current()"
          [attr.lang]="lang.code"
          (click)="choose(lang.code)"
        >
          <mat-icon [class.hidden]="lang.code !== language.current()">check</mat-icon>
          <span>{{ lang.label }}</span>
        </button>
      }
    </mat-menu>
  `,
  styles: `
    .code {
      text-transform: uppercase;
    }
    .hidden {
      visibility: hidden;
    }
  `,
})
export class LanguageSelector {
  protected readonly language = inject(LanguageService);
  protected readonly languages = LANGUAGES;

  protected choose(lang: LanguageCode): void {
    void this.language.choose(lang);
  }
}
