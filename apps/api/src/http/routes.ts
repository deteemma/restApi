import { Router, type Request, type Response } from 'express';
import type { Store } from '../store/store';
import { parse } from './parse';
import {
  collectionExport,
  collectionInput,
  collectionPatch,
  environmentInput,
  folderInput,
  folderPatch,
  requestInput,
  scenarioInput,
} from './schemas';

const owner = (res: Response) => res.locals['owner'] as string;
const param = (req: Request, name: string) => String(req.params[name]);

/** API de gestion : Collections, Dossiers, Requêtes, Environnements et Scénarios. */
export function managementRoutes(store: Store): Router {
  const r = Router();

  // Collections
  r.get('/collections', async (_req, res) => {
    res.json(await store.collections.list(owner(res)));
  });
  r.post('/collections', async (req, res) => {
    res
      .status(201)
      .json(await store.collections.create(owner(res), parse(collectionInput, req.body)));
  });
  r.post('/collections/import', async (req, res) => {
    const data = parse(collectionExport, req.body);
    res.status(201).json(await store.transfer.importCollection(owner(res), data));
  });
  r.get('/collections/:id/export', async (req, res) => {
    const data = await store.transfer.exportCollection(owner(res), param(req, 'id'));
    const file = `${data.collection.name}.restapi.json`;
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.replace(/[^\w.-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(file)}`,
    );
    res.type('application/json').send(JSON.stringify(data, null, 2));
  });
  r.get('/collections/:id', async (req, res) => {
    res.json(await store.collections.get(owner(res), param(req, 'id')));
  });
  r.patch('/collections/:id', async (req, res) => {
    res.json(
      await store.collections.update(
        owner(res),
        param(req, 'id'),
        parse(collectionPatch, req.body),
      ),
    );
  });
  r.delete('/collections/:id', async (req, res) => {
    await store.collections.delete(owner(res), param(req, 'id'));
    res.status(204).end();
  });
  r.get('/collections/:id/tree', async (req, res) => {
    res.json(await store.collections.tree(owner(res), param(req, 'id')));
  });

  // Dossiers
  r.post('/collections/:id/folders', async (req, res) => {
    const input = parse(folderInput, req.body);
    res.status(201).json(await store.folders.create(owner(res), param(req, 'id'), input));
  });
  r.patch('/folders/:id', async (req, res) => {
    res.json(
      await store.folders.update(owner(res), param(req, 'id'), parse(folderPatch, req.body)),
    );
  });
  r.delete('/folders/:id', async (req, res) => {
    await store.folders.delete(owner(res), param(req, 'id'));
    res.status(204).end();
  });

  // Requêtes
  r.post('/collections/:id/requests', async (req, res) => {
    const input = parse(requestInput, req.body);
    res.status(201).json(await store.requests.create(owner(res), param(req, 'id'), input));
  });
  r.get('/requests/:id', async (req, res) => {
    res.json(await store.requests.get(owner(res), param(req, 'id')));
  });
  r.put('/requests/:id', async (req, res) => {
    res.json(
      await store.requests.update(owner(res), param(req, 'id'), parse(requestInput, req.body)),
    );
  });
  r.delete('/requests/:id', async (req, res) => {
    await store.requests.delete(owner(res), param(req, 'id'), {
      force: req.query['force'] === 'true',
    });
    res.status(204).end();
  });

  // Environnements
  r.get('/collections/:id/environments', async (req, res) => {
    res.json(await store.environments.list(owner(res), param(req, 'id')));
  });
  r.post('/collections/:id/environments', async (req, res) => {
    const input = parse(environmentInput, req.body);
    res.status(201).json(await store.environments.create(owner(res), param(req, 'id'), input));
  });
  r.get('/environments/:id', async (req, res) => {
    res.json(await store.environments.get(owner(res), param(req, 'id')));
  });
  r.put('/environments/:id', async (req, res) => {
    const input = parse(environmentInput, req.body);
    res.json(await store.environments.update(owner(res), param(req, 'id'), input));
  });
  r.delete('/environments/:id', async (req, res) => {
    await store.environments.delete(owner(res), param(req, 'id'));
    res.status(204).end();
  });

  // Scénarios
  r.get('/collections/:id/scenarios', async (req, res) => {
    res.json(await store.scenarios.list(owner(res), param(req, 'id')));
  });
  r.post('/collections/:id/scenarios', async (req, res) => {
    const input = parse(scenarioInput, req.body);
    res.status(201).json(await store.scenarios.create(owner(res), param(req, 'id'), input));
  });
  r.get('/scenarios/:id', async (req, res) => {
    res.json(await store.scenarios.get(owner(res), param(req, 'id')));
  });
  r.put('/scenarios/:id', async (req, res) => {
    res.json(
      await store.scenarios.update(owner(res), param(req, 'id'), parse(scenarioInput, req.body)),
    );
  });
  r.delete('/scenarios/:id', async (req, res) => {
    await store.scenarios.delete(owner(res), param(req, 'id'));
    res.status(204).end();
  });
  r.post('/collections/:id/scenario-issues', async (req, res) => {
    const input = parse(scenarioInput, req.body);
    res.json(await store.scenarios.draftIssues(owner(res), param(req, 'id'), input));
  });
  r.get('/scenarios/:id/issues', async (req, res) => {
    res.json(await store.scenarios.issues(owner(res), param(req, 'id')));
  });

  return r;
}
