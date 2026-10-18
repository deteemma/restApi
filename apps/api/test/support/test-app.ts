import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { type Connection } from 'mongoose';
import request from 'supertest';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { RunManager, type RunManagerOptions } from '../../src/runs/run-manager';
import { SecretBox } from '../../src/secrets/secret-box';
import { createStore, type Store } from '../../src/store/store';

export interface TestApp {
  http: ReturnType<typeof request.agent>;
  /** Adresse du serveur réel (pour lire un flux SSE avec fetch). */
  url: string;
  store: Store;
  runs: RunManager;
  box: SecretBox;
  connection: Connection;
  /** Vide toutes les collections MongoDB entre deux tests. */
  reset(): Promise<void>;
  stop(): Promise<void>;
}

/** Application complète sur un MongoDB en mémoire. */
export async function startTestApp(
  options: { env?: Record<string, string>; runs?: Partial<RunManagerOptions> } = {},
): Promise<TestApp> {
  const mongo = await MongoMemoryServer.create();
  const connection = await mongoose.createConnection(mongo.getUri('restapi-test')).asPromise();
  const box = new SecretBox('test-secret-key');
  const store = createStore(connection, box);
  const runs = new RunManager(store, { maxConcurrentRuns: 10, retentionDays: 30, ...options.runs });
  const app = createApp(loadConfig(options.env ?? {}), { store, runs });

  const server: Server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;

  return {
    http: request.agent(app),
    url: `http://127.0.0.1:${port}`,
    store,
    runs,
    box,
    connection,
    async reset() {
      await runs.idle();
      const collections = await connection.db!.collections();
      await Promise.all(collections.map((c) => c.deleteMany({})));
    },
    async stop() {
      await runs.idle();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await connection.close();
      await mongo.stop();
    },
  };
}
