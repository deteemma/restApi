import {
  StepErrorCode,
  type CollectionContext,
  type RequestDefinition,
  type RequestStep,
  type RequestStepResult,
  type StepError,
} from '@restapi/shared';
import { evaluateAssertion } from './assertions';
import { runExtraction } from './extractions';
import { StepFailure, prepareRequest, sendRequest } from './http';
import { VariableError, type VariableScope } from './variables';

export interface RequestStepInput {
  step: RequestStep;
  /** Absente pour une Étape orpheline. */
  request: RequestDefinition | undefined;
  collection: CollectionContext;
  scope: VariableScope;
}

export interface RequestStepOutcome {
  status: 'succeeded' | 'failed';
  result: RequestStepResult;
}

/**
 * Exécute une Étape-requête : construction, envoi, Assertions puis Extractions.
 * Sans Assertion, l'Étape réussit si le statut HTTP est 2xx.
 * Les valeurs extraites sont rangées dans `scope` même si l'Étape échoue.
 */
export async function executeRequestStep(input: RequestStepInput): Promise<RequestStepOutcome> {
  const { step, request, collection } = input;
  const result: RequestStepResult = { assertions: [], extractions: [] };
  const failed = (error: StepError): RequestStepOutcome => ({
    status: 'failed',
    result: { ...result, error },
  });

  if (!request) return failed({ code: StepErrorCode.RequestNotFound, detail: step.requestId });

  const scope = input.scope.withOverrides(step.overrides?.variables);
  try {
    const prepared = prepareRequest(request, step.overrides, collection, scope);
    result.request = prepared.sent;
    const response = await sendRequest(prepared);
    result.response = response;
    result.assertions = request.assertions.map((a) => evaluateAssertion(a, response, scope));
    result.extractions = step.extractions.map((x) => runExtraction(x, response));
  } catch (error) {
    return failed(toStepError(error));
  }

  for (const { extraction, value } of result.extractions) {
    if (value !== undefined) scope.set(extraction.variable, value);
  }

  const status = result.response.status;
  if (result.assertions.length > 0) {
    if (result.assertions.some((a) => !a.passed)) {
      return failed({ code: StepErrorCode.AssertionFailed });
    }
  } else if (status < 200 || status > 299) {
    return failed({ code: StepErrorCode.UnexpectedStatus });
  }
  const missing = result.extractions.filter((x) => x.value === undefined);
  if (missing.length > 0) {
    return failed({
      code: StepErrorCode.ExtractionFailed,
      detail: missing.map((x) => x.extraction.variable).join(', '),
    });
  }
  return { status: 'succeeded', result };
}

function toStepError(error: unknown): StepError {
  if (error instanceof StepFailure) return error.error;
  if (error instanceof VariableError) return { code: error.code, detail: error.names.join(', ') };
  throw error;
}
