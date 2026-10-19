import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  CollectionDto,
  CollectionInput,
  CollectionPatch,
  CollectionTree,
  EnvironmentDto,
  EnvironmentInput,
  FolderDto,
  FolderInput,
  RequestDto,
  RequestInput,
  ScenarioDto,
  ScenarioInput,
  ScenarioIssue,
  EvaluateInput,
  EvaluationDto,
  SendDto,
  SendInput,
  RunDto,
  RunInput,
  RunStatus,
  RunSummaryDto,
} from '@restapi/shared';
import { firstValueFrom, type Observable } from 'rxjs';

/** Client typé de l'API (`/api`). Chaque méthode renvoie une promesse ; une erreur HTTP la rejette. */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);

  private call<T>(request: Observable<T>): Promise<T> {
    return firstValueFrom(request);
  }

  // Collections
  listCollections() {
    return this.call(this.http.get<CollectionDto[]>('/api/collections'));
  }
  getCollection(id: string) {
    return this.call(this.http.get<CollectionDto>(`/api/collections/${id}`));
  }
  createCollection(input: CollectionInput) {
    return this.call(this.http.post<CollectionDto>('/api/collections', input));
  }
  updateCollection(id: string, patch: CollectionPatch) {
    return this.call(this.http.patch<CollectionDto>(`/api/collections/${id}`, patch));
  }
  deleteCollection(id: string) {
    return this.call(this.http.delete<void>(`/api/collections/${id}`));
  }
  getTree(collectionId: string) {
    return this.call(this.http.get<CollectionTree>(`/api/collections/${collectionId}/tree`));
  }

  // Dossiers
  createFolder(collectionId: string, input: FolderInput) {
    return this.call(this.http.post<FolderDto>(`/api/collections/${collectionId}/folders`, input));
  }
  updateFolder(id: string, patch: Partial<FolderInput>) {
    return this.call(this.http.patch<FolderDto>(`/api/folders/${id}`, patch));
  }
  deleteFolder(id: string) {
    return this.call(this.http.delete<void>(`/api/folders/${id}`));
  }

  // Requêtes
  getRequest(id: string) {
    return this.call(this.http.get<RequestDto>(`/api/requests/${id}`));
  }
  createRequest(collectionId: string, input: RequestInput) {
    return this.call(
      this.http.post<RequestDto>(`/api/collections/${collectionId}/requests`, input),
    );
  }
  updateRequest(id: string, input: RequestInput) {
    return this.call(this.http.put<RequestDto>(`/api/requests/${id}`, input));
  }
  deleteRequest(id: string, options: { force?: boolean } = {}) {
    const query = options.force ? '?force=true' : '';
    return this.call(this.http.delete<void>(`/api/requests/${id}${query}`));
  }

  /** Envoi de la Requête (ou de son brouillon), avec l'Environnement choisi. */
  sendRequest(id: string, input: SendInput) {
    return this.call(this.http.post<SendDto>(`/api/requests/${id}/send`, input));
  }
  listSends(id: string) {
    return this.call(this.http.get<SendDto[]>(`/api/requests/${id}/sends`));
  }
  /** Évalue des Assertions ou Extractions sur une réponse déjà reçue. */
  evaluate(collectionId: string, input: EvaluateInput) {
    return this.call(
      this.http.post<EvaluationDto>(`/api/collections/${collectionId}/evaluate`, input),
    );
  }

  // Environnements
  getEnvironment(id: string) {
    return this.call(this.http.get<EnvironmentDto>(`/api/environments/${id}`));
  }
  createEnvironment(collectionId: string, input: EnvironmentInput) {
    return this.call(
      this.http.post<EnvironmentDto>(`/api/collections/${collectionId}/environments`, input),
    );
  }
  updateEnvironment(id: string, input: EnvironmentInput) {
    return this.call(this.http.put<EnvironmentDto>(`/api/environments/${id}`, input));
  }
  deleteEnvironment(id: string) {
    return this.call(this.http.delete<void>(`/api/environments/${id}`));
  }

  // Scénarios
  getScenario(id: string) {
    return this.call(this.http.get<ScenarioDto>(`/api/scenarios/${id}`));
  }
  createScenario(collectionId: string, input: ScenarioInput) {
    return this.call(
      this.http.post<ScenarioDto>(`/api/collections/${collectionId}/scenarios`, input),
    );
  }
  updateScenario(id: string, input: ScenarioInput) {
    return this.call(this.http.put<ScenarioDto>(`/api/scenarios/${id}`, input));
  }
  deleteScenario(id: string) {
    return this.call(this.http.delete<void>(`/api/scenarios/${id}`));
  }
  /** Anomalies d'un brouillon de Scénario, non enregistré. */
  getDraftIssues(collectionId: string, input: ScenarioInput) {
    return this.call(
      this.http.post<ScenarioIssue[]>(`/api/collections/${collectionId}/scenario-issues`, input),
    );
  }

  // Exécutions
  startRun(scenarioId: string, input: RunInput) {
    return this.call(this.http.post<RunSummaryDto>(`/api/scenarios/${scenarioId}/runs`, input));
  }
  stopRun(runId: string) {
    return this.call(this.http.post<void>(`/api/runs/${runId}/stop`, {}));
  }
  getRun(runId: string) {
    return this.call(this.http.get<RunDto>(`/api/runs/${runId}`));
  }
  listRuns(filter: {
    scenarioId?: string;
    collectionId?: string;
    status?: RunStatus;
    limit?: number;
  }) {
    const params = Object.fromEntries(
      Object.entries(filter).filter(([, v]) => v !== undefined),
    ) as Record<string, string | number>;
    return this.call(this.http.get<RunSummaryDto[]>('/api/runs', { params }));
  }
  setRunPinned(runId: string, pinned: boolean) {
    return this.call(this.http.patch<RunSummaryDto>(`/api/runs/${runId}`, { pinned }));
  }

  getScenarioIssues(id: string) {
    return this.call(this.http.get<ScenarioIssue[]>(`/api/scenarios/${id}/issues`));
  }
}
