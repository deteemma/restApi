import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import type {
  CollectionDto,
  CollectionPatch,
  CollectionTree,
  EnvironmentDto,
  RequestDto,
  RequestInput,
  ScenarioDto,
  VariableInput,
} from '@restapi/shared';
import { unchangedInputs } from '../shared/variables/variables-model';
import { ApiClient } from './api-client';

const ENV_KEY = (collectionId: string) => `restapi.environment.${collectionId}`;

/**
 * État de l'espace de travail : Collections, Collection ouverte et son arborescence,
 * Environnement choisi (mémorisé par Collection dans le navigateur).
 * Les actions rechargent l'arborescence après chaque modification.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceStore {
  private readonly api = inject(ApiClient);
  private readonly storage = inject(DOCUMENT).defaultView?.localStorage;

  readonly collections = signal<CollectionDto[]>([]);
  readonly tree = signal<CollectionTree | null>(null);
  readonly collectionId = computed(() => this.tree()?.collection.id ?? null);
  readonly environmentId = signal<string | null>(null);
  readonly environment = computed(
    () => this.tree()?.environments.find((e) => e.id === this.environmentId()) ?? null,
  );

  async loadCollections(): Promise<void> {
    this.collections.set(await this.api.listCollections());
  }

  /** Ouvre une Collection et restaure l'Environnement choisi lors de la dernière visite. */
  async openCollection(id: string): Promise<void> {
    const tree = await this.api.getTree(id);
    this.tree.set(tree);
    const stored = this.read(ENV_KEY(id));
    this.environmentId.set(tree.environments.some((e) => e.id === stored) ? stored : null);
  }

  closeCollection(): void {
    this.tree.set(null);
    this.environmentId.set(null);
  }

  async refreshTree(): Promise<void> {
    const id = this.collectionId();
    if (!id) return;
    const tree = await this.api.getTree(id);
    this.tree.set(tree);
    if (!tree.environments.some((e) => e.id === this.environmentId())) this.selectEnvironment(null);
  }

  selectEnvironment(id: string | null): void {
    this.environmentId.set(id);
    const collectionId = this.collectionId();
    if (collectionId) this.write(ENV_KEY(collectionId), id);
  }

  // Collections ---------------------------------------------------------------

  async createCollection(name: string): Promise<CollectionDto> {
    const created = await this.api.createCollection({ name });
    await this.loadCollections();
    return created;
  }

  async updateCollection(id: string, patch: CollectionPatch) {
    const updated = await this.api.updateCollection(id, patch);
    await Promise.all([this.loadCollections(), this.refreshTree()]);
    return updated;
  }

  async deleteCollection(id: string): Promise<void> {
    await this.api.deleteCollection(id);
    this.write(ENV_KEY(id), null);
    if (this.collectionId() === id) this.closeCollection();
    await this.loadCollections();
  }

  // Dossiers ------------------------------------------------------------------

  async createFolder(name: string, parentId: string | null) {
    const folder = await this.api.createFolder(this.requireCollection(), { name, parentId });
    await this.refreshTree();
    return folder;
  }

  async renameFolder(id: string, name: string) {
    await this.api.updateFolder(id, { name });
    await this.refreshTree();
  }

  async deleteFolder(id: string) {
    await this.api.deleteFolder(id);
    await this.refreshTree();
  }

  // Requêtes ------------------------------------------------------------------

  async createRequest(name: string, folderId: string | null): Promise<RequestDto> {
    const input: RequestInput = {
      name,
      folderId,
      method: 'GET',
      url: '',
      query: [],
      headers: [],
      body: { type: 'none' },
      auth: { type: 'inherit' },
      assertions: [],
    };
    const created = await this.api.createRequest(this.requireCollection(), input);
    await this.refreshTree();
    return created;
  }

  async renameRequest(id: string, name: string) {
    const { id: _id, collectionId: _c, ...input } = await this.api.getRequest(id);
    await this.api.updateRequest(id, { ...input, name });
    await this.refreshTree();
  }

  /** Rejette avec REQUEST_IN_USE si des Scénarios l'utilisent, sauf avec `force`. */
  async deleteRequest(id: string, options: { force?: boolean } = {}) {
    await this.api.deleteRequest(id, options);
    await this.refreshTree();
  }

  // Scénarios -----------------------------------------------------------------

  async createScenario(name: string): Promise<ScenarioDto> {
    const created = await this.api.createScenario(this.requireCollection(), {
      name,
      root: { id: 'root', type: 'group', mode: 'sequential', steps: [] },
    });
    await this.refreshTree();
    return created;
  }

  async renameScenario(id: string, name: string) {
    const scenario = await this.api.getScenario(id);
    await this.api.updateScenario(id, { name, root: scenario.root });
    await this.refreshTree();
  }

  async deleteScenario(id: string) {
    await this.api.deleteScenario(id);
    await this.refreshTree();
  }

  // Environnements ------------------------------------------------------------

  async createEnvironment(name: string): Promise<EnvironmentDto> {
    const created = await this.api.createEnvironment(this.requireCollection(), { name });
    await this.refreshTree();
    return created;
  }

  async updateEnvironment(id: string, name: string, variables: VariableInput[]) {
    const updated = await this.api.updateEnvironment(id, { name, variables });
    await this.refreshTree();
    return updated;
  }

  async renameEnvironment(id: string, name: string) {
    const env = await this.api.getEnvironment(id);
    await this.updateEnvironment(id, name, unchangedInputs(env.variables));
  }

  async deleteEnvironment(id: string) {
    await this.api.deleteEnvironment(id);
    await this.refreshTree();
  }

  // ---------------------------------------------------------------------------

  private requireCollection(): string {
    const id = this.collectionId();
    if (!id) throw new Error('Aucune Collection ouverte');
    return id;
  }

  // Le stockage peut être indisponible (navigation privée…) : le choix vaut alors pour la session.
  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string | null): void {
    try {
      if (value === null) this.storage?.removeItem(key);
      else this.storage?.setItem(key, value);
    } catch {
      // Ignoré : voir read.
    }
  }
}
