import { Router, type Request, type Response } from 'express';
import type { RunDto, RunEvent } from '@restapi/shared';
import type { RunManager } from '../runs/run-manager';
import type { Store } from '../store/store';
import { parse } from './parse';
import { evaluateInput, runInput, runListQuery, runPatch, sendInput } from './schemas';

const owner = (res: Response) => res.locals['owner'] as string;
const param = (req: Request, name: string) => String(req.params[name]);

/** Intervalle des commentaires SSE qui maintiennent la connexion ouverte. */
const HEARTBEAT_MS = 15_000;

/** API d'exécution : Exécutions de Scénarios (avec flux en direct) et Envois de Requêtes. */
export function runRoutes(store: Store, manager: RunManager): Router {
  const r = Router();

  r.post('/scenarios/:id/runs', async (req, res) => {
    const input = parse(runInput, req.body ?? {});
    res.status(202).json(await manager.start(owner(res), param(req, 'id'), input));
  });

  r.get('/runs', async (req, res) => {
    res.json(await store.runs.list(owner(res), parse(runListQuery, req.query)));
  });

  r.get('/runs/:id', async (req, res) => {
    res.json(await store.runs.get(owner(res), param(req, 'id')));
  });

  r.patch('/runs/:id', async (req, res) => {
    const { pinned } = parse(runPatch, req.body);
    res.json(
      await store.runs.setPinned(
        owner(res),
        param(req, 'id'),
        pinned,
        manager.retentionMs,
        new Date(),
      ),
    );
  });

  r.post('/runs/:id/stop', async (req, res) => {
    await manager.stop(owner(res), param(req, 'id'));
    res.status(202).end();
  });

  r.get('/runs/:id/events', async (req, res) => {
    const runOwner = owner(res);
    const id = param(req, 'id');
    await store.runs.summary(runOwner, id); // 404 avant d'ouvrir le flux

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    let sequence = 0;
    const write = (event: RunEvent) => {
      res.write(`id: ${++sequence}\ndata: ${JSON.stringify(event)}\n\n`);
    };

    const subscription = manager.subscribe(runOwner, id, (event) => {
      write(event);
      if (event.type === 'run.finished') close();
    });
    if (!subscription) {
      // Exécution terminée : on rejoue ce qui a été enregistré.
      replayFromStore(await store.runs.get(runOwner, id)).forEach(write);
      res.end();
      return;
    }

    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    const close = () => {
      clearInterval(heartbeat);
      subscription.unsubscribe();
      res.end();
    };
    req.on('close', close);
    subscription.replay.forEach(write);
  });

  r.post('/requests/:id/send', async (req, res) => {
    const input = parse(sendInput, req.body ?? {});
    res.json(await manager.send(owner(res), param(req, 'id'), input));
  });

  r.get('/requests/:id/sends', async (req, res) => {
    await store.requests.get(owner(res), param(req, 'id')); // 404 si la Requête n'existe pas
    res.json(await store.sends.list(owner(res), param(req, 'id')));
  });

  r.post('/collections/:id/evaluate', async (req, res) => {
    const input = parse(evaluateInput, req.body);
    res.json(await manager.evaluate(owner(res), param(req, 'id'), input));
  });

  return r;
}

/** Reconstitue la suite d'événements d'une Exécution terminée. */
function replayFromStore(run: RunDto): RunEvent[] {
  const events: RunEvent[] = [{ type: 'run.started', at: run.startedAt }];
  for (const step of run.steps) {
    if (step.startedAt) {
      events.push({ type: 'step.started', stepId: step.stepId, at: step.startedAt });
    }
    events.push({
      type: 'step.finished',
      stepId: step.stepId,
      status: step.status,
      at: step.finishedAt,
      ...(step.result ? { result: step.result } : {}),
    });
  }
  if (run.status !== 'running') {
    events.push({ type: 'run.finished', status: run.status, at: run.finishedAt ?? run.startedAt });
  }
  return events;
}
