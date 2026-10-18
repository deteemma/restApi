# Internationalisation à l'exécution avec Transloco plutôt qu'avec @angular/localize

L'interface est disponible dès le départ en français, anglais, allemand et italien, et l'utilisateur doit pouvoir changer de langue à tout moment depuis un sélecteur. L'i18n officielle d'Angular produit un build par langue : changer de langue impose un rechargement complet, qui interromprait le suivi en direct d'une Exécution et ferait perdre une saisie en cours. On a donc retenu Transloco, une bibliothèque qui traduit à l'exécution, avec un fichier de traduction par langue chargé à la demande. Le français sert de langue de référence, et un test vérifie que les autres langues ont toutes ses clés.

## Considered Options

- `@angular/localize` (officiel, à la compilation) : rejeté à cause du rechargement complet à chaque changement de langue.
- ngx-translate : plus ancien et moins adapté aux composants standalone.
