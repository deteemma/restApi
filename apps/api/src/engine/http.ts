import { Agent, fetch } from 'undici';
import {
  StepErrorCode,
  type CollectionContext,
  type HttpSettings,
  type KeyValue,
  type ReceivedResponse,
  type RequestBody,
  type RequestDefinition,
  type SentRequest,
  type StepError,
  type StepOverrides,
} from '@restapi/shared';
import { type VariableScope, interpolate } from './variables';

/** Échec d'une Étape-requête, porteur de son code. */
export class StepFailure extends Error {
  constructor(readonly error: StepError) {
    super(error.detail ? `${error.code}: ${error.detail}` : error.code);
    this.name = 'StepFailure';
  }
}

export interface PreparedRequest {
  sent: SentRequest;
  settings: HttpSettings;
}

const CONTENT_TYPES: Record<Exclude<RequestBody['type'], 'none'>, string> = {
  json: 'application/json',
  text: 'text/plain; charset=utf-8',
  xml: 'application/xml',
  form: 'application/x-www-form-urlencoded',
};

const enabled = (pairs: readonly KeyValue[]) => pairs.filter((p) => p.enabled !== false);

/**
 * Construit la requête à envoyer : Surcharges appliquées et Variables résolues.
 * Lève une VariableError ou une StepFailure (INVALID_URL).
 */
export function prepareRequest(
  request: RequestDefinition,
  overrides: StepOverrides | undefined,
  collection: CollectionContext,
  scope: VariableScope,
): PreparedRequest {
  const resolve = (text: string) => interpolate(text, scope);

  const rawUrl = resolve(request.url);
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new StepFailure({ code: StepErrorCode.InvalidUrl, detail: rawUrl });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new StepFailure({ code: StepErrorCode.InvalidUrl, detail: rawUrl });
  }
  for (const q of enabled(request.query))
    url.searchParams.append(resolve(q.name), resolve(q.value));

  // En-têtes indexés sans tenir compte de la casse ; une Surcharge remplace l'en-tête de même nom.
  const headers = new Map<string, { name: string; value: string }>();
  const putHeader = (name: string, value: string) =>
    headers.set(name.toLowerCase(), { name, value });
  for (const h of enabled(request.headers)) putHeader(resolve(h.name), resolve(h.value));
  for (const h of enabled(overrides?.headers ?? [])) putHeader(resolve(h.name), resolve(h.value));

  // Un en-tête défini explicitement l'emporte sur celui que produirait l'authentification.
  const auth = request.auth.type === 'inherit' ? collection.auth : request.auth;
  const putAuthHeader = (name: string, value: string) => {
    if (!headers.has(name.toLowerCase())) putHeader(name, value);
  };
  switch (auth.type) {
    case 'basic': {
      const credentials = `${resolve(auth.username)}:${resolve(auth.password)}`;
      putAuthHeader('Authorization', `Basic ${Buffer.from(credentials).toString('base64')}`);
      break;
    }
    case 'bearer':
      putAuthHeader('Authorization', `Bearer ${resolve(auth.token)}`);
      break;
    case 'apiKey':
      if (auth.in === 'header') putAuthHeader(resolve(auth.name), resolve(auth.value));
      else url.searchParams.append(resolve(auth.name), resolve(auth.value));
      break;
    case 'none':
      break;
  }

  const bodyDef = overrides?.body ?? request.body;
  let body: string | undefined;
  // GET et HEAD n'ont jamais de corps : fetch le refuserait.
  if (bodyDef.type !== 'none' && request.method !== 'GET' && request.method !== 'HEAD') {
    body =
      bodyDef.type === 'form'
        ? new URLSearchParams(
            enabled(bodyDef.fields).map((f) => [resolve(f.name), resolve(f.value)]),
          ).toString()
        : resolve(bodyDef.content);
    if (!headers.has('content-type')) putHeader('Content-Type', CONTENT_TYPES[bodyDef.type]);
  }

  return {
    sent: {
      method: request.method,
      url: url.toString(),
      headers: Object.fromEntries([...headers.values()].map((h) => [h.name, h.value])),
      ...(body === undefined ? {} : { body }),
    },
    settings: { ...collection.settings, ...request.settings },
  };
}

const agents = {
  strict: new Agent(),
  insecure: new Agent({ connect: { rejectUnauthorized: false } }),
};

/** Envoie la requête et lit toute la réponse. Lève une StepFailure (TIMEOUT, NETWORK). */
export async function sendRequest({ sent, settings }: PreparedRequest): Promise<ReceivedResponse> {
  const started = performance.now();
  try {
    const response = await fetch(sent.url, {
      method: sent.method,
      headers: sent.headers,
      body: sent.body,
      redirect: settings.followRedirects ? 'follow' : 'manual',
      signal: AbortSignal.timeout(settings.timeoutMs),
      dispatcher: settings.ignoreTlsErrors ? agents.insecure : agents.strict,
    });
    const body = await response.text();
    const headers: Record<string, string> = {};
    response.headers.forEach((value, name) => (headers[name] = value));
    return {
      status: response.status,
      statusText: response.statusText,
      headers,
      body,
      durationMs: Math.round((performance.now() - started) * 10) / 10,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new StepFailure({ code: StepErrorCode.Timeout, detail: `${settings.timeoutMs} ms` });
    }
    throw new StepFailure({ code: StepErrorCode.Network, detail: networkDetail(error) });
  }
}

/** Code système (ECONNREFUSED, DEPTH_ZERO_SELF_SIGNED_CERT…) si disponible, sinon le message. */
function networkDetail(error: unknown): string {
  const cause = (error as { cause?: { code?: unknown; message?: unknown } })?.cause;
  if (typeof cause?.code === 'string') return cause.code;
  if (typeof cause?.message === 'string') return cause.message;
  return error instanceof Error ? error.message : String(error);
}
