import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  DEFAULT_MAX_CONCURRENCY,
  type ExtractionResult,
  type KeyValue,
  type RequestBody,
  type RequestStep,
  type ScenarioIssue,
  type Step,
  type StepOverrides,
} from '@restapi/shared';
import { ApiClient } from '../../core/api-client';
import { Notifier } from '../../core/notifier';
import { WorkspaceStore } from '../../core/workspace.store';
import type { RequestSummary } from '../../collections/request-tree';
import { CodeEditor } from '../../shared/code-editor/code-editor';
import { KeyValueEditor } from '../../shared/key-value/key-value-editor';
import { MethodBadge } from '../../shared/ui/method-badge';
import { ExtractionsEditor } from './extractions-editor';

type OverrideBodyType = 'keep' | Exclude<RequestBody['type'], 'form'>;

/** Propriétés de l'Étape sélectionnée : réglages d'un Groupe, durée d'une Pause, Surcharges et Extractions. */
@Component({
  selector: 'app-step-properties',
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatSelectModule,
    RouterLink,
    TranslocoPipe,
    CodeEditor,
    ExtractionsEditor,
    KeyValueEditor,
    MethodBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './step-properties.html',
  styleUrl: './step-properties.scss',
})
export class StepProperties {
  readonly step = input.required<Step>();
  /** Requête référencée (Étape-requête), absente si l'Étape est orpheline. */
  readonly request = input<RequestSummary | undefined>(undefined);
  readonly issues = input<readonly ScenarioIssue[]>([]);
  readonly isRoot = input(false);
  readonly stepChange = output<Step>();

  private readonly api = inject(ApiClient);
  private readonly store = inject(WorkspaceStore);
  private readonly notifier = inject(Notifier);

  protected readonly defaultConcurrency = DEFAULT_MAX_CONCURRENCY;
  protected readonly bodyTypes: OverrideBodyType[] = ['keep', 'none', 'json', 'text', 'xml'];
  protected readonly extractionResults = signal<ExtractionResult[] | null>(null);
  protected readonly requestLink = computed(() => {
    const request = this.request();
    return request ? ['/collections', this.store.collectionId(), 'requests', request.id] : null;
  });

  protected readonly requestStep = computed(() => {
    const step = this.step();
    return step.type === 'request' ? step : null;
  });

  /**
   * Surcharges de Variables, éditées comme une liste nom/valeur. L'état est local (réinitialisé
   * seulement quand on change d'Étape) : sinon une ligne encore sans nom disparaîtrait aussitôt.
   */
  private readonly stepId = computed(() => this.step().id);
  protected readonly overrideVariables = linkedSignal<string, KeyValue[]>({
    // Un computed intermédiaire : seul un changement d'identifiant (autre Étape) réinitialise la liste.
    source: this.stepId,
    computation: () =>
      Object.entries(untracked(() => this.requestStep()?.overrides?.variables) ?? {}).map(
        ([name, value]) => ({ name, value }),
      ),
  });

  protected readonly overrideBodyType = computed<OverrideBodyType>(() => {
    const body = this.requestStep()?.overrides?.body;
    return body && body.type !== 'form' ? body.type : 'keep';
  });

  protected patch(change: Partial<Step>): void {
    this.stepChange.emit({ ...this.step(), ...change } as Step);
  }

  protected setConcurrency(raw: string): void {
    const value = Number(raw);
    const step = this.step();
    if (step.type !== 'group') return;
    const { maxConcurrency: _unused, ...rest } = step;
    this.stepChange.emit(
      Number.isInteger(value) && value >= 1 ? { ...rest, maxConcurrency: value } : rest,
    );
  }

  protected setOverrides(change: Partial<StepOverrides>): void {
    const step = this.requestStep();
    if (!step) return;
    const overrides = clean({ ...step.overrides, ...change });
    const { overrides: _old, ...rest } = step;
    this.stepChange.emit(overrides ? { ...rest, overrides } : rest);
  }

  protected setOverrideVariables(items: KeyValue[]): void {
    this.overrideVariables.set(items);
    // Les lignes sans nom restent dans la saisie, mais pas dans le Scénario.
    const variables = Object.fromEntries(items.filter((i) => i.name).map((i) => [i.name, i.value]));
    this.setOverrides({ variables });
  }

  protected setOverrideBodyType(type: OverrideBodyType): void {
    if (type === 'keep') this.setOverrides({ body: undefined });
    else if (type === 'none') this.setOverrides({ body: { type } });
    else {
      const current = this.requestStep()?.overrides?.body;
      const content = current && 'content' in current ? current.content : '';
      this.setOverrides({ body: { type, content } });
    }
  }

  protected setOverrideBodyContent(content: string): void {
    const body = this.requestStep()?.overrides?.body;
    if (body && 'content' in body) this.setOverrides({ body: { ...body, content } });
  }

  protected setExtractions(extractions: RequestStep['extractions']): void {
    this.extractionResults.set(null);
    this.patch({ extractions } as Partial<Step>);
  }

  /** Évalue les Extractions sur la réponse du dernier Envoi de la Requête. */
  protected async evaluateExtractions(): Promise<void> {
    const step = this.requestStep();
    const collectionId = this.store.collectionId();
    if (!step || !collectionId) return;
    try {
      const [last] = await this.api.listSends(step.requestId);
      const response = last?.result.response;
      if (!response) {
        this.notifier.success('extractions.noSend');
        return;
      }
      const result = await this.api.evaluate(collectionId, {
        response,
        extractions: step.extractions,
        environmentId: this.store.environmentId(),
      });
      this.extractionResults.set(result.extractions);
    } catch (e) {
      this.notifier.error(e);
    }
  }
}

/** Retire les Surcharges vides ; undefined s'il n'en reste aucune. */
function clean(overrides: StepOverrides): StepOverrides | undefined {
  const out: StepOverrides = {};
  if (overrides.variables && Object.keys(overrides.variables).length)
    out.variables = overrides.variables;
  if (overrides.headers?.length) out.headers = overrides.headers;
  if (overrides.body) out.body = overrides.body;
  return Object.keys(out).length ? out : undefined;
}
