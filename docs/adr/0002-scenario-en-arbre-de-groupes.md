# Un Scénario est un arbre de Groupes séquentiels/parallèles, pas un graphe de dépendances

Un Scénario est un arbre : chaque Étape est soit une Étape-requête, soit un Groupe (séquentiel ou parallèle) qui contient d'autres Étapes, sans limite de profondeur. On a écarté le DAG, où chaque Étape déclarerait ses dépendances. Il est plus expressif, mais beaucoup plus difficile à éditer et à relire dans l'interface, et l'arbre couvre les cas d'usage visés.

## Considered Options

- Liste plate (tout séquentiel ou tout parallèle) : trop limitée.
- Séquence avec des groupes parallèles sur un seul niveau : cas particulier de l'arbre.
- DAG de dépendances : rejeté pour sa complexité d'édition.
