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
npm run db:up           # MongoDB sur 127.0.0.1:27017
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

## Sécurité

Par défaut, l'API n'écoute que sur `127.0.0.1`. Pour l'exposer (par exemple à une CI), définissez `HOST` et **`API_KEY`** : toutes les routes `/api` sauf `/api/health` exigent alors l'en-tête `X-API-Key`.

## Traductions

Les fichiers sont dans `apps/web/public/i18n/{fr,en,de,it}.json`, et `fr` est la référence. Un test échoue si une clé manque, est en trop ou est vide dans une autre langue, si les paramètres `{{ … }}` diffèrent, ou si un code d'erreur de l'API n'a pas de traduction.
