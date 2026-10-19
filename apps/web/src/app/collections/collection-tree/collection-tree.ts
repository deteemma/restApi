import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink, RouterLinkActive, type ActivatedRouteSnapshot } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ErrorCode, type RequestInUseDetails } from '@restapi/shared';
import { firstValueFrom } from 'rxjs';
import { apiErrorCode, apiErrorDetails } from '../../core/api-error';
import { Notifier } from '../../core/notifier';
import { WorkspaceStore } from '../../core/workspace.store';
import { Dialogs } from '../../shared/ui/dialogs';
import { MethodBadge } from '../../shared/ui/method-badge';
import { discardUnsavedChanges } from '../../shared/unsaved/unsaved-changes.guard';
import { ScenarioDnd } from '../../scenarios/scenario-dnd';
import { buildRequestTree, moveTargets, type MovableItem } from '../request-tree';
import { MoveDialog, type MoveDialogData } from './move-dialog';

type Kind = 'folder' | 'request' | 'scenario' | 'environment';

/** Arborescence de la Collection ouverte : Requêtes (avec Dossiers), Scénarios, Environnements. */
@Component({
  selector: 'app-collection-tree',
  imports: [
    CdkDrag,
    CdkDropList,
    NgTemplateOutlet,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    RouterLink,
    RouterLinkActive,
    TranslocoPipe,
    MethodBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './collection-tree.html',
  styleUrl: './collection-tree.scss',
})
export class CollectionTree {
  protected readonly store = inject(WorkspaceStore);
  /** Zones de dépôt du Scénario ouvert, vers lesquelles on peut glisser une Requête. */
  protected readonly dnd = inject(ScenarioDnd);
  protected readonly noDropHere = () => false;
  private readonly dialogs = inject(Dialogs);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);
  private readonly router = inject(Router);

  protected readonly nodes = computed(() => {
    const tree = this.store.tree();
    return tree ? buildRequestTree(tree) : [];
  });
  /** Dossiers repliés (les autres sont dépliés, y compris les nouveaux). */
  private readonly collapsed = signal(new Set<string>());

  protected link(kind: Exclude<Kind, 'folder'>, id: string): unknown[] {
    return ['/collections', this.store.collectionId(), `${kind}s`, id];
  }

  protected isCollapsed(folderId: string): boolean {
    return this.collapsed().has(folderId);
  }

  protected toggle(folderId: string): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (!next.delete(folderId)) next.add(folderId);
      return next;
    });
  }

  // Création ------------------------------------------------------------------

  protected async newRequest(folderId: string | null): Promise<void> {
    const name = await this.dialogs.askName({ title: 'tree.newRequest', confirm: 'common.create' });
    if (!name) return;
    await this.run(async () => {
      if (folderId) this.expand(folderId);
      const created = await this.store.createRequest(name, folderId);
      await this.router.navigate(this.link('request', created.id));
    });
  }

  protected async newFolder(parentId: string | null): Promise<void> {
    const name = await this.dialogs.askName({ title: 'tree.newFolder', confirm: 'common.create' });
    if (!name) return;
    await this.run(async () => {
      if (parentId) this.expand(parentId);
      await this.store.createFolder(name, parentId);
    });
  }

  protected async newScenario(): Promise<void> {
    const name = await this.dialogs.askName({
      title: 'tree.newScenario',
      confirm: 'common.create',
    });
    if (!name) return;
    await this.run(async () => {
      const created = await this.store.createScenario(name);
      await this.router.navigate(this.link('scenario', created.id));
    });
  }

  protected async newEnvironment(): Promise<void> {
    const name = await this.dialogs.askName({
      title: 'tree.newEnvironment',
      confirm: 'common.create',
    });
    if (!name) return;
    await this.run(async () => {
      const created = await this.store.createEnvironment(name);
      await this.router.navigate(this.link('environment', created.id));
    });
  }

  // Renommage et suppression --------------------------------------------------

  protected async rename(kind: Kind, id: string, current: string): Promise<void> {
    const name = await this.dialogs.askName({
      title: 'dialogs.renameTitle',
      titleParams: { name: current },
      initial: current,
      confirm: 'common.rename',
    });
    if (!name || name === current) return;
    await this.run(() => {
      switch (kind) {
        case 'folder':
          return this.store.renameFolder(id, name);
        case 'request':
          return this.store.renameRequest(id, name);
        case 'scenario':
          return this.store.renameScenario(id, name);
        case 'environment':
          return this.store.renameEnvironment(id, name);
      }
    });
  }

  /** Déplace un Dossier ou une Requête vers un autre Dossier, ou à la racine. */
  protected async move(kind: MovableItem['kind'], id: string, name: string): Promise<void> {
    const tree = this.store.tree();
    if (!tree) return;
    const data: MoveDialogData = { name, targets: moveTargets(tree, { kind, id }) };
    const target = await firstValueFrom(
      this.dialog.open(MoveDialog, { data, autoFocus: 'dialog' }).afterClosed(),
    );
    if (target === undefined) return;
    await this.run(async () => {
      if (target) this.expand(target);
      if (kind === 'folder') await this.store.moveFolder(id, target);
      else await this.store.moveRequest(id, target);
    });
  }

  protected async remove(kind: Kind, id: string, name: string): Promise<void> {
    const confirmed = await this.dialogs.confirm({
      title: 'dialogs.deleteTitle',
      titleParams: { name },
      message: 'dialogs.deleteMessage',
      confirm: 'common.delete',
    });
    if (!confirmed) return;
    await this.run(async () => {
      switch (kind) {
        case 'folder':
          await this.store.deleteFolder(id);
          break;
        case 'request':
          await this.deleteRequest(id);
          break;
        case 'scenario':
          await this.store.deleteScenario(id);
          break;
        case 'environment':
          await this.store.deleteEnvironment(id);
          break;
      }
      // Si l'élément supprimé était ouvert, on revient aux réglages de la Collection.
      if (this.isOpen(id)) {
        await this.router.navigate(
          ['/collections', this.store.collectionId()],
          discardUnsavedChanges,
        );
      }
    });
  }

  /** Si des Scénarios utilisent la Requête, on les liste et on propose de forcer. */
  private async deleteRequest(id: string): Promise<void> {
    try {
      await this.store.deleteRequest(id);
    } catch (error) {
      if (apiErrorCode(error) !== ErrorCode.RequestInUse) throw error;
      const details = apiErrorDetails<RequestInUseDetails>(error);
      const force = await this.dialogs.confirm({
        title: 'dialogs.requestInUseTitle',
        message: 'dialogs.requestInUseMessage',
        items: details?.scenarios.map((s) => s.name) ?? [],
        confirm: 'dialogs.deleteAnyway',
      });
      if (force) await this.store.deleteRequest(id, { force: true });
    }
  }

  /** Vrai si l'élément est ouvert : son identifiant est un paramètre de la route active. */
  private isOpen(id: string): boolean {
    let route: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;
    while (route) {
      if (Object.values(route.params).includes(id)) return true;
      route = route.firstChild;
    }
    return false;
  }

  private expand(folderId: string): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      next.delete(folderId);
      return next;
    });
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.notifier.error(error);
    }
  }
}
