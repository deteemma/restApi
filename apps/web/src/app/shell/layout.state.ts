import { Injectable, signal } from '@angular/core';

/** État de la mise en page (panneau latéral). */
@Injectable({ providedIn: 'root' })
export class LayoutState {
  readonly sidebarOpen = signal(true);

  toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }
}
