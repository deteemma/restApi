/**
 * Moteur d'exécution des Scénarios : module pur, sans base de données.
 * Il reçoit un Instantané et émet des événements d'Exécution.
 */
export { runScenario, type RunOptions, type RunResult } from './run-scenario';
export { validateScenario, type ValidationContext } from './validate-scenario';
export { executeRequestStep, type RequestStepOutcome } from './request-step';
export { VariableError, VariableScope } from './variables';
export { evaluateAssertion } from './assertions';
export { runExtraction } from './extractions';
