# Guide Complet - Fonctionnalites et Execution du Projet Archipel

## 1. Objectif du projet

Archipel est un prototype de protocole P2P local qui fonctionne sans serveur central.
Chaque noeud est a la fois client et serveur.

Le projet couvre:
1. Decouverte de pairs sur reseau local (Sprint 1)
2. Messagerie chiffree de bout en bout (Sprint 2)
3. Transfert de fichiers en chunks, resilient aux pannes (Sprint 3)
4. Interface CLI complete + UI web vanilla + integration IA optionnelle (Sprint 4)

## 2. Fonctionnalites implementees

### 2.1 Reseau P2P local

- Decouverte via UDP multicast (`HELLO`)
- Echange de metadonnees peers via TCP (`PEER_LIST`)
- Keepalive (`PING/PONG`)
- Peer table persistee localement

### 2.2 Messagerie chiffree

- Handshake authentifie (Noise-like)
- Ed25519 pour identite/signature
- X25519 + HKDF pour cle de session
- AES-256-GCM pour chiffrement
- TOFU (Trust On First Use)

### 2.3 Web of Trust local

- Stockage local des cles pairs
- Verification de coherence a reconnexion
- Approbation locale signee (`trust --approve`)
- Revocation locale signee (`trust --revoke`)

### 2.4 Transfert de fichiers multi-noeuds

- Chunking (segmentation fichier)
- Manifest signe
- Protocole `CHUNK_REQ`, `CHUNK_DATA`, `ACK`
- Download parallelise
- Verification hash chunk + hash final
- Fallback si noeud indisponible

### 2.5 IA Gemini (optionnelle)

- Commande directe `ask`
- Declenchement dans chat via `/ask ...` ou `@archipel-ai ...`
- Contexte des derniers messages localement
- Desactivation offline via `--no-ai`

### 2.6 UI Web Vanilla

- HTML/CSS/JS sans framework frontend
- Serveur HTTP local Node
- Panneaux status/peers/trust/chat/fichiers/IA
- Appels API locaux qui reutilisent les commandes CLI

## 3. Arborescence utile

- `src/network/` : discovery + peer table + framing
- `src/messaging/` : secure messaging + trust store
- `src/transfer/` : chunking + download manager + protocol
- `src/cli/archipel.mjs` : interface CLI principale
- `src/ui/server.mjs` : serveur UI web
- `web/` : frontend vanilla
- `demo/` : scripts de checks de validation
- `docs/` : documentation projet

## 4. Prerequis

1. Node.js >= 20
2. npm
3. Reseau local fonctionnel si test multi-machines

Verification:

```bash
node -v
npm -v
```

## 5. Installation pas a pas

```bash
cd /home/daniel/blockchain-bandits/Archipel_Blockchains_Bandits
npm install
cp .env.example .env
```

## 6. Variables d'environnement (important)

Fichier: `.env`

Variables cle:
1. `ARCHIPEL_DISCOVERY_HMAC_KEY`
2. `ARCHIPEL_NODE_NAME`
3. `ARCHIPEL_TCP_PORT`
4. `ARCHIPEL_UDP_MULTICAST_IP`
5. `ARCHIPEL_UDP_MULTICAST_PORT`
6. `ARCHIPEL_AI_ENABLED`
7. `ARCHIPEL_GEMINI_API_KEY`
8. `ARCHIPEL_GEMINI_MODEL`
9. `ARCHIPEL_AI_CONTEXT_MESSAGES`

Exemple minimal local:

```env
ARCHIPEL_NODE_NAME=machine-1
ARCHIPEL_TCP_PORT=7777
ARCHIPEL_DISCOVERY_HMAC_KEY=change-me-in-lan
```

Pour multi-machines:
- la valeur `ARCHIPEL_DISCOVERY_HMAC_KEY` doit etre identique partout
- chaque machine doit avoir un nom de noeud different

## 7. Charger `.env` selon systeme

### Linux/macOS

```bash
set -a
source .env
set +a
```

### Windows PowerShell

```powershell
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
  $name, $value = $_ -split '=', 2
  [System.Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), "Process")
}
```

## 8. Generation des cles noeuds

```bash
node src/crypto/generate-keys.mjs --node-name machine-1 --force
node src/crypto/generate-keys.mjs --node-name machine-2 --force
node src/crypto/generate-keys.mjs --node-name machine-3 --force
```

## 9. Commandes CLI principales

### 9.1 Demarrer un noeud P2P

```bash
node src/cli/archipel.mjs start --port 7777
```

### 9.2 Lister les peers

```bash
node src/cli/archipel.mjs peers
```

### 9.3 Etat local du noeud

```bash
node src/cli/archipel.mjs status
```

### 9.4 Messagerie chiffree

Ecoute:

```bash
node src/cli/archipel.mjs secure-listen --node-name machine-2 --port 8802
```

Envoi:

```bash
node src/cli/archipel.mjs msg <node_id_cible> "Bonjour"
```

### 9.5 Fichiers

Preparation + offre:

```bash
node src/cli/archipel.mjs send <node_id_cible> /chemin/fichier.bin
```

Lister fichiers connus:

```bash
node src/cli/archipel.mjs receive
```

Exposer chunks localement:

```bash
node src/cli/archipel.mjs receive --listen --port 9931
```

Telecharger:

```bash
node src/cli/archipel.mjs download <file_id>
```

### 9.6 Trust

Lister:

```bash
node src/cli/archipel.mjs trust
```

Approuver:

```bash
node src/cli/archipel.mjs trust --approve <node_id>
```

Revoquer:

```bash
node src/cli/archipel.mjs trust --revoke <node_id> --reason "compromised"
```

### 9.7 Gemini

Direct:

```bash
node src/cli/archipel.mjs ask --prompt "resume l'etat"
```

Offline force:

```bash
node src/cli/archipel.mjs ask --prompt "test" --no-ai
```

Dans chat:

```bash
node src/cli/archipel.mjs msg <node_id> "/ask fais un recap"
node src/cli/archipel.mjs msg <node_id> "@archipel-ai que faire maintenant ?"
```

## 10. UI Web Vanilla

Lancer le serveur UI:

```bash
npm run ui:start
```

Ouvrir:

```text
http://127.0.0.1:8787
```

Ce que permet l'UI:
1. Refresh status/peers/trust
2. Envoyer message chiffre
3. Preparer et notifier un fichier
4. Lister fichiers et lancer download
5. Interroger Gemini

## 11. Scenarios de demonstration rapides

### Scenario A - Discovery 3 noeuds

Terminal 1:

```bash
node src/cli/archipel.mjs start --node-name machine-1 --port 7777
```

Terminal 2:

```bash
node src/cli/archipel.mjs start --node-name machine-2 --port 7778
```

Terminal 3:

```bash
node src/cli/archipel.mjs start --node-name machine-3 --port 7779
```

Verification:

```bash
node src/cli/archipel.mjs peers --node-name machine-1
```

### Scenario B - Message E2E

Terminal A:

```bash
node src/cli/archipel.mjs secure-listen --node-name machine-2 --port 8802
```

Terminal B:

```bash
node src/cli/archipel.mjs msg <node_id_machine_2> "Bonjour jury"
```

### Scenario C - Fichier 50 Mo resilient

```bash
npm run sprint3:full:check
```

## 12. Suite de tests officielle du projet

### 12.1 Tests historiques

```bash
npm run sprint1:check
npm run sprint2:check
npm run sprint3:core:check
npm run sprint3:protocol:check
npm run sprint3:download:check
npm run sprint3:full:check
npm run sprint3:check
npm run sprint4:cli:check
```

### 12.2 Nouveaux tests ajoutes

```bash
npm run sprint3:multi:check
npm run sprint3:corrupt:check
```

Interpretation:
- chaque script doit finir par `... check passed`

## 13. Depannage courant

### 13.1 `WARN empty ARCHIPEL_DISCOVERY_HMAC_KEY`

Cause: variable absente du process.
Action: charger `.env` dans le shell avant lancement.

### 13.2 `udp parse fail: bad magic`

Cause: bruit multicast d'autres applis sur le reseau.
Action: non bloquant si peers se detectent et checks passent.

### 13.3 `EADDRINUSE`

Cause: port deja utilise.
Action:

```bash
fuser -k 7777/tcp
fuser -k 8802/tcp
fuser -k 8787/tcp
```

### 13.4 `ai unavailable: HTTP 404`

Cause: modele Gemini invalide/non autorise.
Action: verifier `ARCHIPEL_GEMINI_MODEL` et la cle API.

### 13.5 `127.0.0.1 : commande introuvable`

Cause: commande coupee sur plusieurs lignes sans `\`.
Action: faire une seule ligne ou utiliser `\` correctement.

## 14. Multi-machines Linux + Windows

Checklist:
1. Meme `ARCHIPEL_DISCOVERY_HMAC_KEY` partout
2. Noms de noeuds differents
3. Ports differents si meme machine
4. Firewall autorise UDP multicast + ports TCP utilises
5. Reseau prive (pas guest isolation)

## 15. Soumission finale (hackathon)

1. Verifier tous les checks
2. Completer README contributions
3. Commit + push
4. Tags `sprint-0 ... sprint-4` et `final-submission`
5. Soumettre DevPost avec resume 300 mots

Aides deja pretes dans `docs/`:
- `DEVPOST_300_MOTS.md`
- `SCENARIO_DEMO_JURY.md`
- `TAGS_COMMANDS.md`

## 16. Limites actuelles

1. Web of Trust reste local (pas propagation reseau complete)
2. Chargement `.env` manuel selon shell
3. UI web pilote le CLI (pas bus temps reel websocket)
4. Tests unitaires granularises non exhaustifs (focus integration)

## 17. Commandes essentielles (resume ultra-court)

```bash
npm install
cp .env.example .env
set -a && source .env && set +a
npm run ui:start
npm run sprint1:check
npm run sprint2:check
npm run sprint3:full:check
npm run sprint3:multi:check
npm run sprint3:corrupt:check
npm run sprint4:cli:check
```
