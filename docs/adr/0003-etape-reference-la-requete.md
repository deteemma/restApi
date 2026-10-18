# Une Étape-requête référence la Requête, elle ne la copie pas

Une Étape-requête pointe vers une Requête de Collection. Toute modification de la Requête se répercute donc sur tous les Scénarios qui l'utilisent. Les écarts propres à une Étape passent par des Surcharges. On a choisi la référence plutôt que la copie pour éviter la duplication et la divergence silencieuse. Conséquence : on ne peut pas supprimer ou modifier une Requête sans tenir compte des Scénarios qui l'utilisent.
