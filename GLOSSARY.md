# RestApi

Application web qui permet de préparer des requêtes REST, de les assembler en scénarios séquentiels et/ou parallèles, puis de lancer ces scénarios à la demande et d'en conserver les résultats.

## Language

### Préparation

**Requête** (Request):
La définition d'un appel HTTP : méthode, URL, en-têtes, corps et assertions. Une Requête est stockée dans une Collection, et c'est la seule source de vérité pour cet appel.
_Avoid_: Appel, call, endpoint

**Collection**:
Un ensemble nommé de Requêtes, qui regroupe des variables communes.
_Avoid_: Projet, workspace

**Dossier** (Folder):
Un classement de Requêtes à l'intérieur d'une Collection, qui peut s'imbriquer. Il ne change rien à l'exécution.
_Avoid_: Répertoire, sous-collection

**Environnement** (Environment):
Un jeu nommé de Variables propre à une Collection (par exemple `dev`, `recette`, `prod`). On en choisit un au moment de lancer une Exécution.
_Avoid_: Profil, contexte, config

**Variable**:
Une valeur nommée que l'on injecte dans une Requête avec la syntaxe `{{nom}}`. Elle est résolue par ordre de priorité : Surcharge > Variable d'exécution > Paramètre de lancement > Environnement > Collection.
_Avoid_: Paramètre, placeholder

**Assertion**:
Une condition déclarative que doit remplir une réponse pour que l'Étape soit réussie (statut, valeur à un chemin JSON, en-tête, durée).
_Avoid_: Test, check, validation

### Scénarios

**Scénario** (Scenario):
Un arbre d'Étapes qui décrit l'ordre et la concurrence de plusieurs Requêtes. Il appartient à une seule Collection et ne référence que les Requêtes de cette Collection.
_Avoid_: Workflow, suite, flow, playbook

**Étape** (Step):
Un nœud d'un Scénario. C'est soit une Étape-requête, soit un Groupe, soit une Pause.
_Avoid_: Node, item, tâche

**Étape-requête** (Request step):
Une Étape qui **référence** une Requête (sans la copier). Elle peut porter des Surcharges et des Extractions.
_Avoid_: Copie de requête

**Groupe** (Group):
Une Étape qui contient d'autres Étapes et les exécute soit en mode **séquentiel**, soit en mode **parallèle**. Les Groupes peuvent s'imbriquer à n'importe quelle profondeur.
_Avoid_: Bloc, batch, lot

**Pause**:
Une Étape qui se contente d'attendre une durée donnée avant de laisser la suite s'exécuter.
_Avoid_: Sleep, délai, wait

**Surcharge** (Override):
Une valeur propre à une Étape-requête qui remplace, pour cette Étape uniquement, une Variable ou une partie de la Requête référencée.
_Avoid_: Patch, personnalisation

**Extraction**:
Une règle qui lit une valeur dans la réponse d'une Étape-requête (chemin JSON, en-tête, statut) et la range dans une Variable d'exécution.
_Avoid_: Capture, binding

### Exécution

**Exécution** (Run):
Un lancement d'un Scénario sur un Environnement donné. Elle est enregistrée avec les requêtes réellement envoyées, les réponses, les durées et le résultat des Assertions.
_Avoid_: Lancement, job, session

**Instantané** (Snapshot):
La copie figée, prise au lancement d'une Exécution, du Scénario, des Requêtes qu'il référence et de l'Environnement résolu. Elle garantit que l'historique reflète exactement ce qui a été envoyé.
_Avoid_: Copie, version

**Paramètre de lancement** (Run parameter):
Une Variable fournie ponctuellement au moment de lancer une Exécution, valable pour cette seule Exécution.
_Avoid_: Argument, input

**Variable d'exécution** (Run variable):
Une Variable créée par une Extraction pendant une Exécution, et qui n'existe que le temps de cette Exécution. Quand elle est extraite dans un Groupe parallèle, elle ne devient visible qu'une fois ce Groupe terminé.
_Avoid_: Variable runtime, variable globale

**Arrêt au premier échec** (Stop on failure):
Un réglage d'un Groupe, activé par défaut, qui interrompt le Groupe dès qu'une de ses Étapes échoue. En parallèle, les Étapes sœurs déjà lancées vont quand même jusqu'au bout.
_Avoid_: Fail-fast, bail

**Exécution arrêtée** (Stopped run):
Une Exécution interrompue à la main : les Étapes en attente ne sont pas lancées et les requêtes déjà parties vont jusqu'au bout.
_Avoid_: Exécution annulée, abort

**Exécution épinglée** (Pinned run):
Une Exécution que l'on conserve indéfiniment, à l'abri de la purge automatique de l'historique.
_Avoid_: Exécution favorite, baseline

**Envoi** (Send):
Le lancement d'une Requête seule depuis son éditeur, en dehors de tout Scénario. On en garde un historique léger, distinct de celui des Exécutions.
_Avoid_: Exécution unitaire, test rapide

**Étape orpheline** (Orphan step):
Une Étape-requête dont la Requête référencée a été supprimée. Elle est invalide tant qu'on ne l'a pas réassociée ou retirée.
_Avoid_: Étape cassée

### Statuts

**Statut d'Étape**:
L'un des états En attente, En cours, Réussie, Échouée, Ignorée ou Arrêtée. Une Étape est **Échouée** si une Assertion n'est pas vérifiée, si une erreur réseau survient ou si le délai est dépassé. Sans Assertion, elle échoue dès que le statut HTTP n'est pas 2xx.
_Avoid_: État, résultat

**Ignorée** (Skipped):
Le statut d'une Étape qui n'a pas été lancée parce qu'une Étape a échoué avant elle ou parce que l'Exécution a été arrêtée.
_Avoid_: Sautée, annulée

**Statut d'Exécution**:
L'un des états En cours, Réussie, Échouée ou Arrêtée.
_Avoid_: État

### Sécurité

**Variable secrète** (Secret variable):
Une Variable dont la valeur est masquée partout où elle est affichée (interface, historique) et chiffrée là où elle est stockée.
_Avoid_: Credential, mot de passe
