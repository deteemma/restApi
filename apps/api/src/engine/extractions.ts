import type { Extraction, ExtractionResult, ReceivedResponse } from '@restapi/shared';
import { asText, readTarget } from './assertions';

/** Lit la valeur d'une Extraction. L'appelant décide quoi faire si elle est absente. */
export function runExtraction(
  extraction: Extraction,
  response: ReceivedResponse,
): ExtractionResult {
  const target = readTarget(extraction.source, response);
  return target.found ? { extraction, value: asText(target.value) } : { extraction };
}
