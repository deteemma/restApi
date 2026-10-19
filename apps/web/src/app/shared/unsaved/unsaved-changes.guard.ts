import { DOCUMENT, DestroyRef, inject } from '@angular/core';
import { Router, type CanDeactivateFn, type NavigationBehaviorOptions } from '@angular/router';
import { Dialogs } from '../ui/dialogs';

/** Une page d'édition qui peut avoir des modifications non enregistrées. */
export interface PendingChanges {
  hasUnsavedChanges(): boolean;
}

const DISCARD = 'discardUnsavedChanges';

/**
 * Options de navigation pour quitter une page sans avertir, quand ses modifications n'ont plus
 * d'objet (par exemple après la suppression de l'élément édité).
 */
export const discardUnsavedChanges: NavigationBehaviorOptions = { info: DISCARD };

/** Avant de quitter une page avec des modifications non enregistrées, demande confirmation. */
export const unsavedChangesGuard: CanDeactivateFn<PendingChanges> = async (page) =>
  !page.hasUnsavedChanges() ||
  inject(Router).currentNavigation()?.extras.info === DISCARD ||
  (await inject(Dialogs).confirm({
    title: 'unsaved.title',
    message: 'unsaved.message',
    confirm: 'unsaved.leave',
  }));

/**
 * Fait avertir par le navigateur si l'on recharge ou ferme l'onglet avec des modifications
 * non enregistrées. À appeler dans le constructeur de la page.
 */
export function warnBeforeUnload(page: PendingChanges): void {
  const window = inject(DOCUMENT).defaultView;
  if (!window) return;
  const listener = (event: BeforeUnloadEvent) => {
    if (page.hasUnsavedChanges()) event.preventDefault();
  };
  window.addEventListener('beforeunload', listener);
  inject(DestroyRef).onDestroy(() => window.removeEventListener('beforeunload', listener));
}
