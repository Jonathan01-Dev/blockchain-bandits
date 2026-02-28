# Suivi des corrections

## Sprint Audit 1 - Cohérence globale

### Statut

- Termine

### Incohérences détectées

- `README.md` utilisait des commandes PowerShell (`Copy-Item`) alors que le projet est principalement exécuté sous Linux/macOS dans ce contexte.
- Aucun script `npm run sprint3:check` n'existait alors que cette commande est attendue intuitivement.
- La terminologie des tests/documentation mélangeait des noms pédagogiques (`alice`, `bob`) et des noms de machines.
- Une variable `.env` (`ARCHIPEL_AI_ENABLED`) n'était pas utilisée dans le code.

### Corrections appliquées

- Ajout de l'alias npm `sprint3:check` vers `demo/sprint3-full-check.mjs`.
- Harmonisation des exemples de commandes README en `bash`.
- Remplacement des références `alice/bob` par `machine-1/machine-2` dans:
- README
- CLI usage (`src/cli/archipel.mjs`)
- script de validation Sprint 2 (`demo/sprint2-check.mjs`)
- docs de suivi/changelog
- Suppression de `ARCHIPEL_AI_ENABLED` de `.env.example`.

### Validation exécutée

- `npm run sprint1:check` ✅
- `npm run sprint2:check` ✅
- `npm run sprint3:core:check` ✅
- `npm run sprint3:protocol:check` ✅
- `npm run sprint3:download:check` ✅
- `npm run sprint3:full:check` ✅
- `npm run sprint3:check` ✅

### Résultat

- Le comportement fonctionnel n'a pas régressé.
- La doc, les scripts npm et les exemples d'usage sont maintenant cohérents pour l'exécution réelle.

## Sprint Audit 2 - Robustesse runtime

### Statut

- Termine

### Incohérences détectées

- Le framing TCP n'avait aucune limite de taille de payload (risque de frame abusive/memoire).
- Le parsing des frames pouvait lever une exception JSON non encadree.
- Les `waiters` de synchronisation (attente de frame) n'etaient pas retires explicitement en cas de timeout.
- Les sockets secure/chunk ne rejetaient pas systematiquement les attentes en cas de fermeture/erreur.
- Le download manager supposait implicitement que `manifest.chunks[idx]` correspond toujours a l'index logique du chunk.

### Corrections appliquées

- Ajout d'une limite `MAX_FRAME_BYTES` (8 Mo) + validation de longueur dans `tcp-frame`.
- Gestion explicite d'erreur sur JSON invalide (`invalid frame json`).
- Protection du decode frame dans les listeners TCP/secure/chunk avec destruction socket controlee.
- Nettoyage fiable des `waiters` en timeout + rejet de toutes les attentes en `close/error/end`.
- Durcissement du mapping metadata chunk via `Map(index -> chunkMeta)` dans le download manager.

### Validation exécutée

- `npm run sprint1:check` ✅
- `npm run sprint2:check` ✅
- `npm run sprint3:core:check` ✅
- `npm run sprint3:protocol:check` ✅
- `npm run sprint3:download:check` ✅
- `npm run sprint3:full:check` ✅
- `npm run sprint3:check` ✅

### Résultat

- Les checks fonctionnels passent toujours.
- Le runtime est plus robuste face aux trames invalides, aux fermetures socket et aux timeouts.
