import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import type { CollectionAuth, RequestAuth } from '@restapi/shared';

type AuthType = RequestAuth['type'];

/**
 * Authentification d'une Requête (qui peut hériter de sa Collection) ou d'une Collection.
 * Pour un secret, on recommande une Variable secrète : `{{token}}`.
 */
@Component({
  selector: 'app-auth-editor',
  imports: [MatFormFieldModule, MatInputModule, MatSelectModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-form-field class="type">
      <mat-label>{{ 'auth.type' | transloco }}</mat-label>
      <mat-select [value]="auth().type" (valueChange)="changeType($event)">
        @for (t of types(); track t) {
          <mat-option [value]="t">{{ 'auth.types.' + t | transloco }}</mat-option>
        }
      </mat-select>
    </mat-form-field>

    @switch (auth().type) {
      @case ('inherit') {
        <p class="hint">{{ 'auth.inheritHint' | transloco }}</p>
      }
      @case ('basic') {
        <div class="fields">
          <mat-form-field>
            <mat-label>{{ 'auth.username' | transloco }}</mat-label>
            <input matInput [value]="field('username')" (input)="set('username', $event)" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'auth.password' | transloco }}</mat-label>
            <input matInput [value]="field('password')" (input)="set('password', $event)" />
          </mat-form-field>
        </div>
      }
      @case ('bearer') {
        <mat-form-field class="wide">
          <mat-label>{{ 'auth.token' | transloco }}</mat-label>
          <input matInput [value]="field('token')" (input)="set('token', $event)" />
        </mat-form-field>
      }
      @case ('apiKey') {
        <div class="fields">
          <mat-form-field>
            <mat-label>{{ 'auth.keyName' | transloco }}</mat-label>
            <input matInput [value]="field('name')" (input)="set('name', $event)" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'auth.keyValue' | transloco }}</mat-label>
            <input matInput [value]="field('value')" (input)="set('value', $event)" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ 'auth.keyIn' | transloco }}</mat-label>
            <mat-select [value]="field('in')" (valueChange)="setValue('in', $event)">
              <mat-option value="header">{{ 'auth.inHeader' | transloco }}</mat-option>
              <mat-option value="query">{{ 'auth.inQuery' | transloco }}</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
      }
    }
    @if (auth().type !== 'none' && auth().type !== 'inherit') {
      <p class="hint">
        {{ 'auth.secretHint' | transloco }} <code>{{ secretExample }}</code>
      </p>
    }
  `,
  styles: `
    .type {
      width: 260px;
    }
    .fields {
      display: flex;
      flex-wrap: wrap;
      gap: 0 12px;
    }
    .wide {
      width: min(560px, 100%);
    }
    .hint {
      margin: 0 0 8px;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class AuthEditor {
  readonly auth = input.required<RequestAuth>();
  /** Vrai pour une Requête (elle peut hériter de sa Collection). */
  readonly allowInherit = input(false);
  readonly authChange = output<RequestAuth>();

  /** Exemple affiché dans l'aide (accolades impossibles à écrire dans le template). */
  protected readonly secretExample = '{{token}}';

  protected readonly types = computed<AuthType[]>(() =>
    this.allowInherit()
      ? ['inherit', 'none', 'basic', 'bearer', 'apiKey']
      : ['none', 'basic', 'bearer', 'apiKey'],
  );

  protected field(name: string): string {
    return String((this.auth() as Record<string, unknown>)[name] ?? '');
  }

  protected set(name: string, event: Event): void {
    this.setValue(name, (event.target as HTMLInputElement).value);
  }

  protected setValue(name: string, value: string): void {
    this.authChange.emit({ ...this.auth(), [name]: value } as RequestAuth);
  }

  protected changeType(type: AuthType): void {
    this.authChange.emit(emptyAuth(type));
  }
}

function emptyAuth(type: AuthType): RequestAuth {
  switch (type) {
    case 'inherit':
    case 'none':
      return { type };
    case 'basic':
      return { type, username: '', password: '' };
    case 'bearer':
      return { type, token: '' };
    case 'apiKey':
      return { type, name: 'X-API-Key', value: '', in: 'header' } satisfies CollectionAuth;
  }
}
