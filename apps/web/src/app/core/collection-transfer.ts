import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ApiClient } from './api-client';
import { Notifier } from './notifier';
import { WorkspaceStore } from './workspace.store';

/** Export (téléchargement) et import (choix d'un fichier) d'une Collection. */
@Injectable({ providedIn: 'root' })
export class CollectionTransfer {
  private readonly api = inject(ApiClient);
  private readonly store = inject(WorkspaceStore);
  private readonly notifier = inject(Notifier);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  async export(collectionId: string): Promise<void> {
    try {
      const { blob, filename } = await this.api.exportCollection(collectionId);
      const url = URL.createObjectURL(blob);
      const link = Object.assign(this.document.createElement('a'), {
        href: url,
        download: filename,
      });
      link.click();
      URL.revokeObjectURL(url);
      this.notifier.success('transfer.exported');
    } catch (e) {
      this.notifier.error(e);
    }
  }

  /** Demande un fichier, l'importe comme nouvelle Collection et l'ouvre. */
  pickAndImport(): void {
    const input = Object.assign(this.document.createElement('input'), {
      type: 'file',
      accept: '.json,application/json',
    });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) void this.import(file);
    });
    input.click();
  }

  async import(file: Blob): Promise<void> {
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      this.notifier.failure('transfer.invalidFile');
      return;
    }
    try {
      const created = await this.api.importCollection(data);
      await this.store.loadCollections();
      this.notifier.success('transfer.imported', { name: created.name });
      await this.router.navigate(['/collections', created.id]);
    } catch (e) {
      this.notifier.error(e);
    }
  }
}
