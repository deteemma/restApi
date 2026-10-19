import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  DEFAULT_HTTP_SETTINGS,
  HTTP_METHODS,
  type AssertionEvaluation,
  type RequestInput,
  type SendDto,
} from '@restapi/shared';
import { ApiClient } from '../core/api-client';
import { Notifier } from '../core/notifier';
import { WorkspaceStore } from '../core/workspace.store';
import { CodeEditor } from '../shared/code-editor/code-editor';
import { KeyValueEditor } from '../shared/key-value/key-value-editor';
import { MethodBadge } from '../shared/ui/method-badge';
import { AssertionsEditor } from './assertions/assertions-editor';
import { AuthEditor } from './auth-editor';
import { HttpSettingsEditor } from './http-settings-editor';
import { changeBodyType, draftFrom, prettyJson, sameDraft, type BodyType } from './request-draft';
import { ResponseViewer } from './response-viewer';

/**
 * Éditeur de Requête : le brouillon se modifie librement, s'envoie tel quel (« Envoyer ») et ne
 * remplace la version enregistrée qu'avec « Enregistrer ».
 */
@Component({
  selector: 'app-request-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatTabsModule,
    MatTooltipModule,
    TranslocoPipe,
    AssertionsEditor,
    AuthEditor,
    CodeEditor,
    HttpSettingsEditor,
    KeyValueEditor,
    MethodBadge,
    ResponseViewer,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-page.html',
  styleUrl: './request-page.scss',
  host: {
    '(keydown.control.enter)': 'send($event)',
    '(keydown.meta.enter)': 'send($event)',
    '(keydown.control.s)': 'save($event)',
    '(keydown.meta.s)': 'save($event)',
  },
})
export class RequestPage {
  /** Paramètres de route. */
  readonly requestId = input.required<string>();
  readonly collectionId = input.required<string>();

  private readonly api = inject(ApiClient);
  private readonly store = inject(WorkspaceStore);
  private readonly notifier = inject(Notifier);

  protected readonly methods = HTTP_METHODS;
  /** Exemple de l'URL (les accolades ne peuvent pas passer par une traduction). */
  protected readonly urlExample = '{{baseUrl}}/clients';
  protected readonly bodyTypes: BodyType[] = ['none', 'json', 'text', 'xml', 'form'];

  protected readonly request = resource({
    params: () => ({ id: this.requestId() }),
    loader: ({ params }) => this.api.getRequest(params.id),
  });
  private readonly sendsResource = resource({
    params: () => ({ id: this.requestId() }),
    loader: ({ params }) => this.api.listSends(params.id),
  });
  /** Réglages HTTP de la Collection, affichés comme valeurs héritées. */
  private readonly collection = resource({
    params: () => ({ id: this.collectionId() }),
    loader: ({ params }) => this.api.getCollection(params.id),
  });

  protected readonly draft = signal<RequestInput | null>(null);
  private readonly saved = signal<RequestInput | null>(null);
  protected readonly dirty = computed(() => {
    const draft = this.draft();
    const saved = this.saved();
    return !!draft && !!saved && !sameDraft(draft, saved);
  });

  protected readonly sends = computed<SendDto[]>(() => this.sendsResource.value() ?? []);
  protected readonly selectedSendId = signal<string | null>(null);
  /** Envoi affiché ; null tant qu'il n'y en a aucun. */
  protected readonly selectedSend = computed<SendDto | null>(
    () => this.sends().find((s) => s.id === this.selectedSendId()) ?? this.sends()[0] ?? null,
  );
  protected readonly sending = signal(false);
  protected readonly evaluation = signal<AssertionEvaluation[] | null>(null);
  protected readonly inheritedSettings = computed(
    () => this.collection.value()?.settings ?? DEFAULT_HTTP_SETTINGS,
  );

  constructor() {
    effect(() => {
      const request = this.request.value();
      if (!request) return;
      untracked(() => {
        const draft = draftFrom(request);
        this.draft.set(draft);
        this.saved.set(draft);
        this.selectedSendId.set(null);
        this.evaluation.set(null);
      });
    });
    effect(() => {
      const error = this.request.error() ?? this.sendsResource.error();
      if (error) this.notifier.error(error);
    });
  }

  /** Modifie une partie du brouillon. */
  protected patch(change: Partial<RequestInput>): void {
    this.draft.update((d) => (d ? { ...d, ...change } : d));
  }

  protected setBodyType(type: BodyType): void {
    const draft = this.draft();
    if (draft) this.patch({ body: changeBodyType(draft.body, type) });
  }

  protected setBodyContent(content: string): void {
    const body = this.draft()?.body;
    if (body && body.type !== 'none' && body.type !== 'form')
      this.patch({ body: { ...body, content } });
  }

  protected formatJson(): void {
    const body = this.draft()?.body;
    if (body?.type !== 'json') return;
    const pretty = prettyJson(body.content);
    if (pretty) this.patch({ body: { ...body, content: pretty } });
  }

  protected async send(event?: Event): Promise<void> {
    event?.preventDefault();
    const draft = this.draft();
    if (!draft || this.sending()) return;
    this.sending.set(true);
    try {
      const send = await this.api.sendRequest(this.requestId(), {
        environmentId: this.store.environmentId(),
        draft,
      });
      this.sendsResource.set([send, ...this.sends()].slice(0, 20));
      this.selectedSendId.set(send.id);
      this.evaluation.set(null);
    } catch (e) {
      this.notifier.error(e);
    } finally {
      this.sending.set(false);
    }
  }

  protected async save(event?: Event): Promise<void> {
    event?.preventDefault();
    const draft = this.draft();
    if (!draft || !this.dirty()) return;
    try {
      const updated = await this.api.updateRequest(this.requestId(), draft);
      this.saved.set(draftFrom(updated));
      await this.store.refreshTree(); // la méthode a pu changer
      this.notifier.success('requestPage.saved');
    } catch (e) {
      this.notifier.error(e);
    }
  }

  protected revert(): void {
    this.draft.set(this.saved());
  }

  protected async evaluate(): Promise<void> {
    const response = this.selectedSend()?.result.response;
    const draft = this.draft();
    if (!response || !draft) return;
    try {
      const result = await this.api.evaluate(this.collectionId(), {
        response,
        assertions: draft.assertions,
        environmentId: this.store.environmentId(),
      });
      this.evaluation.set(result.assertions);
    } catch (e) {
      this.notifier.error(e);
    }
  }
}
