# Mode d'emploi UI - Archipel

Ce guide couvre **toutes les fonctionnalites de l'interface web** pour tester le projet complet en local, sans Internet (sauf Gemini si active).

## 1. Lancer l'UI

```bash
npm run ui:start
```

Ouvrir ensuite:

```text
http://127.0.0.1:8787
```

## 2. Principe general

L'UI est organisee en panneaux:

1. **Laboratoire local (multi-noeuds)**
2. **Etat et discovery**
3. **Web of Trust**
4. **Messagerie chiffree E2E**
5. **Transfert de fichiers**
6. **Gemini direct (optionnel)**
7. **Journal des actions UI**

Les trois noeuds de test par defaut sont:

- `machine-1`
- `machine-2`
- `machine-3`

## 3. Parcours de test complet (recommande)

1. Dans **Laboratoire local**:
- cliquer `Generer les cles (3 noeuds)`
- cliquer `Demarrer tous les services (3 noeuds)`
- cliquer `Auto-remplir les IDs et file_id`

2. Dans **Etat et discovery**:
- choisir un noeud
- cliquer `Rafraichir`
- verifier `status` + `peers`

3. Dans **Web of Trust**:
- verifier `trust`
- tester `Approuver` puis `Revoquer`

4. Dans **Messagerie chiffree E2E**:
- choisir noeud emetteur et noeud cible
- verifier auto-remplissage `node_id cible` + `port secure-listen`
- envoyer un message

5. Dans **Transfert de fichiers**:
- preparer/notifier un fichier depuis un noeud source
- lister les fichiers cote receveur
- auto-remplir `file_id`
- lancer `Telecharger`

6. Dans **Gemini direct** (optionnel):
- cocher `--no-ai` pour mode offline strict
- ou renseigner les variables Gemini pour un vrai appel API

## 4. Correspondance UI <-> CLI

### 4.1 Demarrage et reseau

- **Demarrer** (dans la table des noeuds) -> `start --port ...`
- **Etat et discovery / Rafraichir** -> `status` + `peers`

### 4.2 Commandes minimales du PDF

Les commandes CLI minimales du Sprint 4 sont toutes testables via l'UI:

1. `start --port 7777`
2. `peers`
3. `msg <node_id> 'Hello!'`
4. `send <node_id> <filepath>`
5. `receive`
6. `download <file_id>`
7. `status`
8. `trust <node_id>`

Details UI:

- `msg`: panneau **Messagerie chiffree E2E**
- `send`: panneau **Transfert de fichiers / Preparer et notifier**
- `receive`: bouton **Lister fichiers connus**
- `download`: zone `file_id` + bouton **Telecharger**
- `trust <node_id>`: panneau **Web of Trust**, champ filtre `node_id`

### 4.3 Trust avance

- `trust --approve <node_id> --by <node_name>` -> bouton **Approuver**
- `trust --revoke <node_id> --reason "..."` -> bouton **Revoquer**

### 4.4 Gemini

- `ask --prompt "..."` -> panneau **Gemini direct**
- `--no-ai` -> checkbox *Forcer mode sans IA*
- trigger chat `/ask ...` et `@archipel-ai ...` -> panneau **Messagerie chiffree E2E**

## 5. Auto-remplissage des cibles

Dans les panneaux messagerie et envoi fichier:

- le choix du **noeud cible** remplit automatiquement:
  - `node_id cible`
  - `port secure-listen cible`

L'auto-remplissage global remplit aussi:

- `file_id` (quand disponible)
- la liste des peers explicites pour `download`

## 6. Test offline strict

Pour rester strictement hors Internet:

1. ne pas activer Gemini (`ARCHIPEL_AI_ENABLED=false`)
2. ou cocher les options `--no-ai` dans l'UI

Toutes les fonctions P2P, trust, chat chiffre et transfert fichier restent locales.

## 7. Depannage rapide

1. **Pas de peers**
- verifier que les 3 noeuds sont demarres
- verifier ports TCP differents

2. **Message echec**
- verifier `node_id cible`
- verifier `port secure-listen cible`

3. **Download echec**
- verifier que des providers tournent (`receive --listen`)
- verifier `file_id` et peers explicites

4. **Gemini indisponible**
- attendu en mode offline
- sinon verifier `ARCHIPEL_GEMINI_API_KEY` et `ARCHIPEL_GEMINI_MODEL`

## 8. Bonnes pratiques demo jury

1. lancer les 3 noeuds depuis le panneau laboratoire
2. montrer `status/peers`
3. envoyer un message chiffre
4. montrer `trust`
5. transferer puis telecharger un fichier
6. terminer avec Gemini (ou `--no-ai` pour demo offline)