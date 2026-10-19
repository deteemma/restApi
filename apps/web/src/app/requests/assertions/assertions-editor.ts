import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Assertion, AssertionEvaluation, AssertionOperator } from '@restapi/shared';
import { AssertionHelp } from './assertion-help';
import {
  OPERATORS,
  TARGETS,
  VALUE_TYPES,
  isUnary,
  retarget,
  type TargetType,
} from './assertion-catalog';

/**
 * Édition des Assertions d'une Requête, avec l'aide sur trois niveaux : infobulles sur chaque
 * cible et opérateur, panneau d'aide, et évaluation sur la dernière réponse.
 */
@Component({
  selector: 'app-assertions-editor',
  imports: [
    JsonPipe,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatTooltipModule,
    TranslocoPipe,
    AssertionHelp,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './assertions-editor.html',
  styleUrl: './assertions-editor.scss',
})
export class AssertionsEditor {
  readonly assertions = input.required<readonly Assertion[]>();
  /** Résultats de la dernière évaluation, dans le même ordre que les Assertions. */
  readonly evaluation = input<readonly AssertionEvaluation[] | null>(null);
  /** Vrai s'il existe une réponse sur laquelle évaluer. */
  readonly canEvaluate = input(false);
  readonly assertionsChange = output<Assertion[]>();
  readonly evaluate = output<void>();

  protected readonly targets = TARGETS;
  protected readonly operators = OPERATORS;
  protected readonly valueTypes = VALUE_TYPES;
  protected readonly isUnary = isUnary;
  protected readonly helpOpen = signal(false);

  protected add(): void {
    this.emit([
      ...this.assertions(),
      { target: { type: 'status' }, operator: 'equals', expected: '200' },
    ]);
  }

  protected remove(index: number): void {
    this.emit(this.assertions().filter((_, i) => i !== index));
  }

  protected setTarget(index: number, type: TargetType): void {
    this.update(index, (a) => ({ ...a, target: retarget(a.target, type) }));
  }

  protected setTargetText(index: number, text: string): void {
    this.update(index, (a) =>
      a.target.type === 'header'
        ? { ...a, target: { type: 'header', name: text } }
        : a.target.type === 'jsonPath'
          ? { ...a, target: { type: 'jsonPath', path: text } }
          : a,
    );
  }

  protected setOperator(index: number, operator: AssertionOperator): void {
    this.update(index, (a) => {
      if (isUnary(operator)) return { target: a.target, operator };
      const expected = operator === 'isType' ? 'string' : (a.expected ?? '');
      return { ...a, operator, expected };
    });
  }

  protected setExpected(index: number, expected: string): void {
    this.update(index, (a) => ({ ...a, expected }));
  }

  /** Résultat de l'évaluation pour cette Assertion, s'il correspond toujours à son contenu. */
  protected resultFor(index: number): AssertionEvaluation | null {
    const result = this.evaluation()?.[index];
    const assertion = this.assertions()[index];
    if (!result || !assertion) return null;
    return JSON.stringify(result.assertion) === JSON.stringify(assertion) ? result : null;
  }

  private update(index: number, change: (a: Assertion) => Assertion): void {
    this.emit(this.assertions().map((a, i) => (i === index ? change(a) : a)));
  }

  private emit(assertions: Assertion[]): void {
    this.assertionsChange.emit(assertions);
  }
}
