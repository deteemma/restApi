# Plan de mise en œuvre — V1

> **État au 19 octobre 2026 : la V1 est terminée (livraisons L0 à L8 et reliquats).**
>
> Écarts par rapport au plan :
>
> - L'éditeur d'Extractions est arrivé en L6 avec les Étapes de Scénario, et non en L5 : une Extraction appartient à une Étape-requête, pas à une Requête.
> - Monaco est servi sous forme précompilée (`scripts/copy-monaco.mjs`), car le bundler d'Angular ne sait pas traiter les CSS de sa version ESM.
> - Reliquats livrés après L8 : déplacer une Requête ou un Dossier entre Dossiers (action « Déplacer vers… » du panneau gauche, plutôt qu'un glisser-déposer, déjà réservé au dépôt dans un Scénario) ; avertir quand on quitte une page avec des modifications non enregistrées (navigation interne et fermeture de l'onglet).

Ce plan découle de la session de conception. Pour le vocabulaire, voir [GLOSSARY.md](../GLOSSARY.md). Pour les décisions structurantes, voir [docs/adr/](adr/).

Chaque livraison doit pouvoir être montrée et testée à elle seule. On développe le moteur en TDD, avant tout le reste.

---

## L0 — Socle

**But** : un monorepo qui démarre, avec une API qui répond et une interface vide mais déjà disponible en 4 langues.

- Monorepo **npm workspaces** :
  - `apps/api` : Express, TypeScript
  - `apps/web` : Angular standalone, avec Angular Material
  - `packages/shared` : les types communs (modèle du domaine, codes d'erreur, événements d'Exécution)
- TypeScript strict partout, ESLint et Prettier.
- `docker-compose.yml` avec MongoDB, et `npm run dev` qui lance l'API et l'interface ensemble.
- API :
  - route `GET /api/health`
  - écoute sur `127.0.0.1` par défaut
  - middleware **clé d'API**, actif seulement si `API_KEY` est défini (ADR 0001)
- Web :
  - **Transloco** avec `fr`, `en`, `de` et `it` (ADR 0005)
  - sélecteur « globe » dans la barre du haut, chaque langue écrite dans sa propre langue
  - au démarrage : langue du navigateur si elle est prise en charge, sinon `fr`
  - langue choisie mémorisée dans le `localStorage`
- **Test de complétude i18n** : il échoue dès qu'une clé de `fr` manque dans une autre langue.
- Tests : Vitest pour `api` et `shared`, le lanceur Angular pour `web`.

**Fini quand** : `npm run dev` affiche la coquille de l'interface, la langue change sans rechargement, et `npm test` passe au vert.

---

## L1 — Moteur d'exécution (TDD, sans MongoDB)

**But** : le cœur critique, sous forme d'un module pur dans `apps/api/src/engine`.

- **Entrée** : un Instantané (Scénario, Requêtes et Environnement résolus), des Paramètres de lancement et un `AbortSignal`.
- **Sortie** : un flux d'événements typés (début et fin d'Étape, Variable extraite, fin d'Exécution) et le résultat final.

**Banc de test** : une **API cible factice**, un serveur Express lancé sur un port aléatoire par les tests. On la pilote par des routes du type `/delay/:ms`, `/status/:code`, `/echo` et `/counter`, pour mesurer la concurrence réelle.

Ordre TDD :

1. **Résolution des Variables** `{{nom}}`, avec l'ordre de priorité : Surcharge > Variable d'exécution > Paramètre de lancement > Environnement > Collection. Une Variable inconnue produit une erreur explicite.
2. **Étape-requête** :
   - méthodes GET, POST, PUT, PATCH, DELETE, HEAD et OPTIONS
   - corps JSON, texte, XML ou form-urlencoded
   - authentification aucune, Basic, Bearer ou clé API, avec héritage de la Collection
   - délai de 30 s, redirections suivies, option TLS
   - mesure de la durée
   - client HTTP : le `fetch` natif de Node (undici)
3. **Assertions** :
   - cibles : statut, en-tête, chemin JSON, durée
   - opérateurs : égal, différent, contient, existe, n'existe pas, regex, `<`, `<=`, `>`, `>=`, est de type
   - règle par défaut « 2xx » quand l'Étape n'a pas d'Assertion
   - Échouée aussi en cas d'erreur réseau ou de délai dépassé
4. **Extractions** depuis un chemin JSON (`jsonpath-plus`), un en-tête ou le statut, vers une Variable d'exécution.
5. **Groupe séquentiel** avec l'Arrêt au premier échec : les Étapes restantes passent en **Ignorée**, et l'échec remonte au Groupe parent.
6. **Groupe parallèle** :
   - concurrence maximale (10 par défaut)
   - les Étapes sœurs déjà lancées vont jusqu'au bout
   - les Variables extraites ne deviennent visibles qu'une fois le Groupe terminé
7. **Pause**.
8. **Arrêt manuel** : on ne lance plus aucune Étape, celles qui sont en vol finissent, et l'Exécution passe en **Arrêtée**.
9. **Validation d'un Scénario** (fonction pure, réutilisée par l'API et l'interface) :
   - deux Extractions du même nom dans un même Groupe parallèle
   - Étapes orphelines
   - Variables jamais définies, signalées comme avertissement

**Fini quand** : tous les comportements ci-dessus sont couverts par des tests d'intégration qui passent contre l'API factice.

---

## L2 — Persistance et API de gestion

**But** : un CRUD complet du modèle de préparation.

- Modèles Mongoose : `Collection`, `Folder`, `Request`, `Environment` et `Scenario`, chacun avec un champ `owner`. En V1, il vaut toujours l'utilisateur local.
- Les Dossiers s'imbriquent et servent uniquement au classement.
- **Variables secrètes** : chiffrées au repos en AES-256-GCM, avec la clé `SECRET_KEY` fournie par l'environnement du serveur. Elles sont toujours renvoyées masquées par l'API.
- **Suppression d'une Requête utilisée** :
  - par défaut, réponse `409` avec la liste des Scénarios concernés
  - avec `?force=true`, la suppression passe et les Étapes concernées deviennent orphelines
- Les erreurs renvoient des **codes** stables, définis dans `shared`, que l'interface traduit.
- Tests : MongoDB en mémoire (`mongodb-memory-server`).

**Fini quand** : on peut tout créer, lire, modifier et supprimer par l'API, et les tests passent.

---

## L3 — Exécutions et Envois côté serveur

**But** : brancher le moteur sur l'API et sur la persistance.

- `POST /api/scenarios/:id/runs` avec `{ environmentId, parameters }` :
  - valide le Scénario
  - fige l'**Instantané** : les secrets sont déchiffrés en mémoire pour l'exécution, mais masqués dans ce qui est stocké (ADR 0004)
  - lance l'Exécution en arrière-plan et répond `202` avec l'identifiant
- Persistance au fil de l'eau des résultats de chaque Étape. Les requêtes réellement envoyées sont stockées avec les valeurs secrètes masquées.
- `GET /api/runs/:id/events` : flux **SSE** (rejoue l'état courant, puis envoie les événements en direct).
- `POST /api/runs/:id/stop`, `GET /api/runs` (liste filtrable) et `GET /api/runs/:id` (détail).
- `PATCH /api/runs/:id` pour épingler ou désépingler.
- Rétention : index TTL sur `expiresAt` (30 jours). Épingler une Exécution retire ce champ.
- Plafond global d'Exécutions simultanées sur le serveur.
- **Envoi** : `POST /api/requests/:id/send` avec `{ environmentId }`. On garde les 20 derniers Envois par Requête.

**Fini quand** : on peut lancer un Scénario par l'API (ou `curl`), suivre son flux SSE, l'arrêter et le retrouver dans l'historique.

---

## L4 — Coquille de l'interface

**But** : la disposition à la Bruno.

- Arborescence à gauche : Collections, Dossiers, Requêtes, Scénarios (création, renommage, suppression, avec la gestion du `409` de suppression).
- Éditeur au centre, panneau des résultats en bas ou à droite.
- Sélecteur d'Environnement dans la barre du haut, et éditeur d'Environnements avec Variables secrètes masquées.
- Tous les libellés en clés i18n, dans les 4 langues. Dates, nombres et durées au format de la langue active.

---

## L5 — Éditeur de Requête et Envoi

- Méthode, URL, en-têtes, authentification (avec héritage) et corps (éditeur **Monaco**).
- Bouton **Envoyer** et visualiseur de réponse : statut, durée, en-têtes et corps formaté.
- Historique des 20 derniers Envois.
- Éditeur d'**Assertions** et d'**Extractions**, avec l'aide sur trois niveaux :
  1. infobulles sur chaque cible et chaque opérateur
  2. panneau « Aide Assertions » : le catalogue et un aide-mémoire des chemins JSON
  3. bouton **Évaluer** sur la réponse du dernier Envoi, qui affiche la valeur trouvée et le résultat
- Réglages HTTP : délai, redirections, TLS.

---

## L6 — Éditeur de Scénario et Exécution en direct

- Arbre éditable avec **glisser-déposer** (Angular CDK) : on dépose des Requêtes depuis l'arborescence, on ajoute des Groupes et des Pauses.
- Réglages d'un Groupe : mode, concurrence maximale, Arrêt au premier échec.
- Pour chaque Étape-requête : Surcharges et Extractions.
- Erreurs et avertissements de validation affichés directement sur les Étapes concernées.
- Fenêtre de lancement : choix de l'Environnement et des Paramètres de lancement.
- Pendant l'Exécution : statut en direct sur chaque Étape (SSE), bouton **Arrêter**, détail d'une Étape au clic.

---

## L7 — Historique des Exécutions

- Liste par Scénario : statut, date, durée, nombre d'Assertions OK et KO, filtre sur le statut.
- Détail : l'arbre de l'Instantané, puis requête envoyée, réponse et Assertions pour chaque Étape.
- Épingler ou désépingler une Exécution.

---

## L8 — Export et import JSON

- Export d'une Collection (Dossiers, Requêtes, Environnements, Scénarios) au format JSON, avec un champ `schemaVersion`. Les **valeurs secrètes sont exclues** : seul le nom de la Variable est exporté.
- Import avec validation du schéma, et création d'une nouvelle Collection.

---

## Hors V1 (rappel)

Multi-utilisateur, scripts JavaScript libres dans une sandbox, Groupes « boucle » et jeux de données, planification, multipart et OAuth2, import Bruno/Postman, comparaison côte à côte d'Exécutions, Scénarios qui utilisent plusieurs Collections, tests de bout en bout.
