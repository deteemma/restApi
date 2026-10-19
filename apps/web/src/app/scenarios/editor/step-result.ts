import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import type { RequestStepResult, StepStatus } from '@restapi/shared';
import { ResponseDetails } from '../../requests/response-details';
import { StatusIcon } from './status-icon';

/** Résultat d'une Étape pendant ou après une Exécution. */
@Component({
  selector: 'app-step-result',
  imports: [JsonPipe, MatIconModule, TranslocoPipe, ResponseDetails, StatusIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h3>
      <app-status-icon [status]="status()" />
      {{ 'stepStatus.' + status() | transloco }}
    </h3>
    @if (result(); as r) {
      @if (r.assertions.length) {
        <h4>{{ 'requestPage.tabs.assertions' | transloco: { count: r.assertions.length } }}</h4>
        <ul class="checks">
          @for (a of r.assertions; track $index) {
            <li [class.ok]="a.passed" [class.ko]="!a.passed">
              <mat-icon>{{ a.passed ? 'check_circle' : 'cancel' }}</mat-icon>
              <span>
                {{ 'assertions.targets.' + a.assertion.target.type + '.label' | transloco }}
                @if (a.assertion.target.type === 'jsonPath') {
                  <code>{{ a.assertion.target.path }}</code>
                } @else if (a.assertion.target.type === 'header') {
                  <code>{{ a.assertion.target.name }}</code>
                }
                {{ 'assertions.operators.' + a.assertion.operator + '.label' | transloco }}
                @if (a.expected !== undefined) {
                  <code>{{ a.expected }}</code>
                }
                —
                {{ 'assertions.found' | transloco }}
                <code>{{ 'actual' in a ? (a.actual | json) : '∅' }}</code>
              </span>
            </li>
          }
        </ul>
      }
      @if (r.extractions.length) {
        <h4>{{ 'extractions.title' | transloco }}</h4>
        <ul class="checks">
          @for (x of r.extractions; track $index) {
            <li [class.ok]="x.value !== undefined" [class.ko]="x.value === undefined">
              <mat-icon>{{ x.value !== undefined ? 'check_circle' : 'cancel' }}</mat-icon>
              <code>{{ x.extraction.variable }} = {{ x.value ?? '∅' }}</code>
            </li>
          }
        </ul>
      }
      <app-response-details [result]="r" />
    } @else {
      <p class="hint">{{ 'scenarioRun.noResult' | transloco }}</p>
    }
  `,
  styles: `
    h3 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 12px;
      font: var(--mat-sys-title-medium);
    }
    h4 {
      margin: 12px 0 4px;
      font: var(--mat-sys-title-small);
    }
    .checks {
      list-style: none;
      padding: 0;
      margin: 0 0 12px;
      font: var(--mat-sys-body-small);
    }
    .checks li {
      display: flex;
      align-items: start;
      gap: 6px;
      padding: 3px 0;
      word-break: break-word;
    }
    .checks mat-icon {
      flex: none;
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .ok mat-icon {
      color: light-dark(#1b7f3b, #6fdc8c);
    }
    .ko mat-icon {
      color: var(--mat-sys-error);
    }
    code {
      font:
        12px ui-monospace,
        'Cascadia Code',
        Consolas,
        monospace;
    }
    .hint {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class StepResult {
  readonly status = input.required<StepStatus>();
  readonly result = input<RequestStepResult | undefined>(undefined);
}
