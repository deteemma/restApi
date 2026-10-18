# Les requêtes HTTP sont exécutées par le backend Node, pas par le navigateur

C'est le serveur Express qui envoie toutes les requêtes des Scénarios. Angular se limite à piloter les Exécutions et à en afficher le déroulement. On évite ainsi les blocages CORS, on peut atteindre des API internes et on contrôle la concurrence des Groupes parallèles. Une Exécution continue aussi quand l'onglet est fermé. En contrepartie, le serveur doit être joignable depuis les API ciblées. De plus, les futurs scripts libres (pré/post-requête) s'exécuteront côté serveur et devront être isolés dans une sandbox.
