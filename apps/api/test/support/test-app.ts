import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { type Connection } from 'mongoose';
import request from 'supertest';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { SecretBox } from '../../src/secrets/secret-box';
import { createStore, type Store } from '../../src/store/store';

export interface TestApp {
  http: ReturnType<typeof request.agent>;
  store: Store;
  box: SecretBox;
  connection: Connection;
  /** Vide toutes les collections MongoDB entre deux tests. */
  reset(): Promise<void>;
  stop(): Promise<void>;
}

/** Application complète sur un MongoDB en mémoire. */
export async function startTestApp(env: Record<string, string> = {}): Promise<TestApp> {
  const mongo = await MongoMemoryServer.create();
  const connection = await mongoose.createConnection(mongo.getUri('restapi-test')).asPromise();
  const box = new SecretBox('test-secret-key');
  const store = createStore(connection, box);
  const app = createApp(loadConfig(env), { store });
  return {
    http: request.agent(app),
    store,
    box,
    connection,
    async reset() {
      const collections = await connection.db!.collections();
      await Promise.all(collections.map((c) => c.deleteMany({})));
    },
    async stop() {
      await connection.close();
      await mongo.stop();
    },
  };
}
