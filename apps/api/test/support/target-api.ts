import { once } from 'node:events';
import http from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { generate } from 'selfsigned';

export interface ReceivedCall {
  method: string;
  path: string;
  startedAt: number;
  endedAt?: number;
}

/**
 * API cible factice utilisée par les tests du moteur. On la pilote par ses routes :
 * - `ANY /echo` renvoie la requête reçue (méthode, chemin, query, en-têtes, corps brut) ;
 * - `GET /status/:code` répond avec ce statut ;
 * - `GET /delay/:ms` répond après ce délai et sert à mesurer la concurrence réelle ;
 * - `POST /items` crée un élément (201 avec un `id`), et `GET /items/:id` le relit (sinon 404) ;
 * - `GET /redirect` redirige (302) vers /echo ;
 * - `GET /text` répond en texte brut ;
 * - `GET /headers?name=value` renvoie les en-têtes demandés.
 */
export class TargetApi {
  readonly calls: ReceivedCall[] = [];
  maxInFlight = 0;
  private inFlight = 0;
  private nextId = 1;
  private readonly items = new Map<number, unknown>();

  private server!: http.Server;
  private baseUrl = '';

  get url(): string {
    return this.baseUrl;
  }

  static async start(options: { https?: boolean } = {}): Promise<TargetApi> {
    const target = new TargetApi();
    const app = express();
    app.use(express.text({ type: '*/*' }));
    app.use((req, res, next) => {
      target.track(req, res);
      next();
    });
    target.routes(app);

    target.server = options.https
      ? https.createServer(await selfSignedCert(), app)
      : http.createServer(app);
    target.server.listen(0, '127.0.0.1');
    await once(target.server, 'listening');
    const { port } = target.server.address() as AddressInfo;
    target.baseUrl = `${options.https ? 'https' : 'http'}://127.0.0.1:${port}`;
    return target;
  }

  /** Remet les compteurs à zéro entre deux tests. */
  reset(): void {
    this.calls.length = 0;
    this.maxInFlight = 0;
  }

  async close(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  /** Appels reçus sur un chemin donné. */
  callsTo(path: string): ReceivedCall[] {
    return this.calls.filter((c) => c.path === path);
  }

  private track(req: express.Request, res: express.Response): void {
    const call: ReceivedCall = { method: req.method, path: req.path, startedAt: performance.now() };
    this.calls.push(call);
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    res.on('finish', () => {
      call.endedAt = performance.now();
      this.inFlight--;
    });
  }

  private routes(app: express.Express): void {
    app.all('/echo', (req, res) => {
      res.json({
        method: req.method,
        path: req.path,
        query: req.query,
        headers: req.headers,
        body: typeof req.body === 'string' ? req.body : '',
      });
    });
    app.get('/status/:code', (req, res) => {
      res.status(Number(req.params.code)).json({ code: Number(req.params.code) });
    });
    app.get('/delay/:ms', (req, res) => {
      setTimeout(() => res.json({ waited: Number(req.params.ms) }), Number(req.params.ms));
    });
    app.post('/items', (req, res) => {
      const id = this.nextId++;
      const item = { id, ...(req.body ? (JSON.parse(req.body as string) as object) : {}) };
      this.items.set(id, item);
      res.status(201).json(item);
    });
    app.get('/items/:id', (req, res) => {
      const item = this.items.get(Number(req.params.id));
      if (item) res.json(item);
      else res.status(404).json({ error: 'not found' });
    });
    app.get('/redirect', (_req, res) => {
      res.redirect(302, '/echo');
    });
    app.get('/text', (_req, res) => {
      res.type('text/plain').send('hello');
    });
    app.get('/headers', (req, res) => {
      for (const [name, value] of Object.entries(req.query)) res.set(name, String(value));
      res.json({});
    });
  }
}

async function selfSignedCert() {
  const pems = await generate([{ name: 'commonName', value: 'localhost' }], {
    keySize: 2048,
    notAfterDate: new Date(Date.now() + 24 * 3600 * 1000),
  });
  return { key: pems.private, cert: pems.cert };
}
