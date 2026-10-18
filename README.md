# RestApi

Préparez des Requêtes REST, assemblez-les en Scénarios séquentiels et/ou parallèles, et lancez-les à la demande.

- Vocabulaire : [GLOSSARY.md](GLOSSARY.md)
- Décisions d'architecture : [docs/adr/](docs/adr/)
- Plan de la V1 : [docs/plan-v1.md](docs/plan-v1.md)

## Prérequis

- Node.js ≥ 24.15 (avec nvm-windows : `nvm install 24` puis `nvm use 24.22.0`)
- Docker Desktop, pour MongoDB (utilisé à partir de la livraison L2)

## Démarrage

```sh
npm install
cp .env.example .env    # facultatif
npm run db:up           # MongoDB sur 127.0.0.1:27018
npm run dev             # API sur http://127.0.0.1:3000, interface sur http://localhost:4200
```

## Structure

| Dossier           | Rôle                                                        |
| ----------------- | ----------------------------------------------------------- |
| `apps/api`        | API Express, qui exécute aussi les requêtes HTTP (ADR 0001) |
| `apps/web`        | Interface Angular, en 4 langues via Transloco (ADR 0005)    |
| `packages/shared` | Types et codes d'erreur communs à l'API et à l'interface    |

## Scripts

| Commande            | Effet                                            |
| ------------------- | ------------------------------------------------ |
| `npm run dev`       | Lance l'API et l'interface en mode développement |
| `npm test`          | Lance tous les tests (Vitest)                    |
| `npm run typecheck` | Vérifie les types de chaque paquet               |
| `npm run lint`      | ESLint (TypeScript et templates Angular)         |
| `npm run format`    | Formate tout le code avec Prettier               |
| `npm run build`     | Construit l'API (`apps/api/dist`) et l'interface |

## API de gestion

Toutes les routes sont sous `/api`. Les erreurs ont la forme `{ "error": { "code": "…", "details": … } }`.

| Ressource      | Routes                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| Collections    | `GET/POST /collections`, `GET/PATCH/DELETE /collections/:id`, `GET /collections/:id/tree`                       |
| Dossiers       | `POST /collections/:id/folders`, `PATCH/DELETE /folders/:id`                                                    |
| Requêtes       | `POST /collections/:id/requests`, `GET/PUT/DELETE /requests/:id` (`?force=true` si utilisée par des Scénarios)  |
| Environnements | `GET/POST /collections/:id/environments`, `GET/PUT/DELETE /environments/:id`                                    |
| Scénarios      | `GET/POST /collections/:id/scenarios`, `GET/PUT/DELETE /scenarios/:id`, `GET /scenarios/:id/issues` (Anomalies) |

## API d'exécution

| Action                          | Route                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------- |
| Lancer un Scénario              | `POST /scenarios/:id/runs` `{ environmentId?, parameters? }` → 202            |
| Suivre en direct (SSE)          | `GET /runs/:id/events` (rejoue le passé, puis diffuse jusqu'à `run.finished`) |
| Arrêter                         | `POST /runs/:id/stop`                                                         |
| Historique                      | `GET /runs?scenarioId=&collectionId=&status=&limit=`, `GET /runs/:id`         |
| Épingler                        | `PATCH /runs/:id` `{ pinned }`                                                |
| Envoyer une Requête seule       | `POST /requests/:id/send` `{ environmentId?, draft? }`                        |
| Derniers Envois (20 au maximum) | `GET /requests/:id/sends`                                                     |

Exemple en ligne de commande (par exemple depuis une CI) :

```sh
curl -X POST http://127.0.0.1:3000/api/scenarios/<id>/runs -H 'Content-Type: application/json' -d '{"parameters":{"tenant":"acme"}}'
curl -N http://127.0.0.1:3000/api/runs/<runId>/events
```

Les Exécutions non épinglées sont purgées après `RUN_RETENTION_DAYS` jours (30 par défaut). Ce qui est stocké ou diffusé masque les valeurs secrètes (`••••••`) et les identifiants des en-têtes `Authorization`, et tronque les corps au-delà de 1 Mo.

Les **Variables secrètes** sont chiffrées en base (AES-256-GCM, clé `SECRET_KEY`) et ne sont jamais renvoyées : l'API indique seulement `hasValue`. Pour garder une valeur secrète inchangée, renvoyez la Variable sans `value`.

## Sécurité

Par défaut, l'API n'écoute que sur `127.0.0.1`. Pour l'exposer (par exemple à une CI), définissez `HOST` et **`API_KEY`** : toutes les routes `/api` sauf `/api/health` exigent alors l'en-tête `X-API-Key`.

## Traductions

Les fichiers sont dans `apps/web/public/i18n/{fr,en,de,it}.json`, et `fr` est la référence. Un test échoue si une clé manque, est en trop ou est vide dans une autre langue, si les paramètres `{{ … }}` diffèrent, ou si un code d'erreur de l'API n'a pas de traduction.
