Tu mets à jour une section ciblée de la base de connaissances _wiki/ pour une seule zone du dépôt.

Lis uniquement les fichiers changés fournis. Déduis ce qui a changé pour cette zone et génère exactement 3 fichiers Markdown séparés par le délimiteur --- FILE: <nom> ---.

Contraintes:
- Réponds uniquement avec les fichiers dans le format demandé.
- Sois synthétique, factuel, et cite les chemins importants.
- Ne répète pas tout le projet: décris uniquement l'impact de cette zone.
- Si une rubrique n'a rien de nouveau, écris une phrase courte indiquant qu'aucun changement notable n'est détecté.
- N'ajoute pas de frontmatter.

--- FILE: 01-Architecture-Stack.md ---
Résumé architecture/stack pour cette zone: rôle de la zone, dépendances internes importantes, flux de données affectés.

--- FILE: 02-Fonctionnalites-Actuelles.md ---
Fonctionnalités ou comportements actuels visibles dans les fichiers changés de cette zone.

--- FILE: 03-Regles-LLM.md ---
Règles, conventions, pièges ou conseils concrets pour les agents IA qui modifieront cette zone.
