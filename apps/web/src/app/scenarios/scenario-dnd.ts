import { Injectable, signal } from '@angular/core';
import type { RequestSummary } from '../collections/request-tree';

/** Ce que l'on fait glisser vers un Scénario : une Requête du panneau, ou une Étape existante. */
export type ScenarioDragData =
  { kind: 'request'; request: RequestSummary } | { kind: 'step'; stepId: string };

/**
 * Relie le panneau des Requêtes à l'éditeur de Scénario ouvert : celui-ci publie ses zones de
 * dépôt, sur lesquelles les Requêtes du panneau peuvent être déposées.
 */
@Injectable({ providedIn: 'root' })
export class ScenarioDnd {
  readonly dropListIds = signal<string[]>([]);
}

/** Identifiant d'une zone de dépôt (unique dans la page, quel que soit l'identifiant de l'Étape). */
export const dropListId = (groupId: string) => `scenario-drop-${groupId}`;
