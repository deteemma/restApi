import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

export interface NameDialogData {
  /** Clé de traduction du titre, et ses paramètres. */
  title: string;
  titleParams?: Record<string, unknown>;
  initial?: string;
  /** Clé de traduction du bouton de validation. */
  confirm: string;
}

@Component({
  selector: 'app-name-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.title | transloco: data.titleParams }}</h2>
    <form (ngSubmit)="submit()">
      <mat-dialog-content>
        <mat-form-field class="field">
          <mat-label>{{ 'common.name' | transloco }}</mat-label>
          <input
            matInput
            name="name"
            [ngModel]="name()"
            (ngModelChange)="name.set($event)"
            maxlength="200"
            required
            cdkFocusInitial
          />
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
        <button mat-flat-button type="submit" [disabled]="!name().trim()">
          {{ data.confirm | transloco }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .field {
      width: min(400px, 70vw);
    }
  `,
})
export class NameDialog {
  protected readonly data = inject<NameDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<NameDialog, string>);
  protected readonly name = signal(this.data.initial ?? '');

  protected submit(): void {
    const name = this.name().trim();
    if (name) this.ref.close(name);
  }
}

export interface ConfirmDialogData {
  title: string;
  titleParams?: Record<string, unknown>;
  message: string;
  /** Éléments listés sous le message (par exemple les Scénarios concernés). */
  items?: string[];
  confirm: string;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.title | transloco: data.titleParams }}</h2>
    <mat-dialog-content>
      <p>{{ data.message | transloco }}</p>
      @if (data.items?.length) {
        <ul>
          @for (item of data.items; track $index) {
            <li>{{ item }}</li>
          }
        </ul>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false" cdkFocusInitial>
        {{ 'common.cancel' | transloco }}
      </button>
      <button mat-flat-button class="danger" [mat-dialog-close]="true">
        {{ data.confirm | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .danger {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
    }
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}

/** Raccourcis pour les boîtes de dialogue courantes. */
@Injectable({ providedIn: 'root' })
export class Dialogs {
  private readonly dialog = inject(MatDialog);

  /** Demande un nom ; undefined si l'utilisateur annule. */
  askName(data: NameDialogData): Promise<string | undefined> {
    return firstValueFrom(
      this.dialog.open(NameDialog, { data, autoFocus: 'dialog' }).afterClosed(),
    );
  }

  /** Demande confirmation d'une action destructrice. */
  async confirm(data: ConfirmDialogData): Promise<boolean> {
    return (await firstValueFrom(this.dialog.open(ConfirmDialog, { data }).afterClosed())) === true;
  }
}
