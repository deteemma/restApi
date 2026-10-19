import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { TranslocoPipe } from '@jsverse/transloco';
import type { MoveTarget } from '../request-tree';

export interface MoveDialogData {
  /** Nom du Dossier ou de la Requête à déplacer. */
  name: string;
  targets: MoveTarget[];
}

/**
 * Choix de la destination d'un déplacement. Se ferme avec l'identifiant du Dossier choisi
 * (`null` pour la racine), ou `undefined` si l'on annule.
 */
@Component({
  selector: 'app-move-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatListModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ 'tree.moveTitle' | transloco: { name: data.name } }}</h2>
    <mat-dialog-content>
      @if (data.targets.length === 0) {
        <p>{{ 'tree.noMoveTarget' | transloco }}</p>
      } @else {
        <mat-action-list>
          @for (target of data.targets; track target.folderId) {
            <button mat-list-item (click)="choose(target.folderId)">
              <mat-icon matListItemIcon>{{ target.folderId ? 'folder' : 'home' }}</mat-icon>
              <span matListItemTitle>{{
                target.folderId ? target.path.join(' / ') : ('tree.root' | transloco)
              }}</span>
            </button>
          }
        </mat-action-list>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | transloco }}</button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content {
      min-width: min(400px, 70vw);
    }
  `,
})
export class MoveDialog {
  protected readonly data = inject<MoveDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<MoveDialog, string | null>);

  protected choose(folderId: string | null): void {
    this.ref.close(folderId);
  }
}
