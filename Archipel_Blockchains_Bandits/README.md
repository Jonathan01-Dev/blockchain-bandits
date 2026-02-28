# Archipel - Blockchains Bandits

Protocole P2P local, decentralise, chiffre de bout en bout, sans serveur central.

## Etat des sprints

- Sprint 0: termine
- Sprint 1: termine
- Sprint 2: termine
- Sprint 3: termine
- Sprint 4: CLI demo integree + README final

## Architecture implementee

- Discovery: UDP multicast (HELLO) sur `239.255.42.99:6000`
- Echange metadata pairs: TCP en TLV (`PEER_LIST`, `PING`, `PONG`)
- Canal message E2E: handshake Noise-like + AES-256-GCM
- Transfert fichier: manifest signe + chunks + `CHUNK_REQ/CHUNK_DATA/ACK`
- Stockage local: `.archipel/` (peer table, trust store, index, chunks, downloads)

Schema logique:

```text
+----------------------+           +----------------------+
| Node A               |           | Node B               |
| UDP HELLO <--------> |  LAN      | UDP HELLO <--------> |
| TCP PEER_LIST/PING   | <-------> | TCP PEER_LIST/PING   |
| Secure MSG (E2E)     | <-------> | Secure MSG (E2E)     |
| CHUNK provider/client| <-------> | CHUNK provider/client|
+----------------------+           +----------------------+
```

Voir aussi:
- `docs/architecture.md`
- `docs/protocol-spec.md`

## Primitives cryptographiques

- Ed25519: identite de noeud + signatures (authentification)
- X25519: echange de secret ephemere (session par connexion)
- HKDF-SHA256: derivation de cle de session
- AES-256-GCM: chiffrement + auth tag des messages
- HMAC-SHA256: integrite des paquets discovery Archipel v1
- SHA-256: hash fichiers/chunks

Justification:
- Primitives standards, robustes et disponibles dans les libs natives Node.
- Pas d'algorithme maison.

## Installation (step-by-step)

1. Pre-requis:
- Node.js >= 20

2. Installation:

```bash
npm install
cp .env.example .env
```

3. Config minimale `.env`:

```env
ARCHIPEL_DISCOVERY_HMAC_KEY=change-me-in-real-lan
```

Sur plusieurs machines, la valeur `ARCHIPEL_DISCOVERY_HMAC_KEY` doit etre identique.

4. Generer les cles des noeuds utilises:

```bash
node src/crypto/generate-keys.mjs --node-name machine-1 --force
node src/crypto/generate-keys.mjs --node-name machine-2 --force
node src/crypto/generate-keys.mjs --node-name machine-3 --force
```

## Commandes CLI (Sprint 4)

- `start`: demarrer le noeud reseau P2P
- `peers`: lister les pairs connus
- `status`: etat local (node_id, peers, trust, manifests)
- `trust`: lister le trust store local
- `secure-listen`: ecouter les messages E2E
- `secure-send` / `msg <node_id> 'Hello!'`: envoyer un message E2E
- `send <node_id> <filepath>`: preparer le fichier + notifier le pair cible
- `receive`: lister fichiers connus localement
- `receive --listen`: exposer les chunks locaux aux autres noeuds
- `download <file_id>`: telecharger un fichier depuis les peers decouverts
- `ask`: interroger Gemini (optionnel, desactivable)

Actions trust avancees:
- `trust --approve <node_id> --by <node_name>`: signer localement une approbation (propagation confiance)
- `trust --revoke <node_id> --reason \"...\"`: enregistrer une revocation signee locale

Aide rapide:

```bash
node src/cli/archipel.mjs
```

## UI Web Vanilla (bonus Sprint 4)

Demarrage:

```bash
npm run ui:start
```

Puis ouvrir:

```text
http://127.0.0.1:8787
```

Fonctions disponibles:
- lecture status/peers/trust/files
- envoi message chiffre (avec trigger IA `/ask` ou `@archipel-ai`)
- preparation + notification fichier
- download par file_id
- requete Gemini directe

## Guide de demo jury (3 cas d'usage)

### Cas 1 - Decouverte P2P (Sprint 1)

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

### Cas 2 - Message chiffre E2E (Sprint 2)

Terminal A:

```bash
node src/cli/archipel.mjs secure-listen --node-name machine-2 --port 8802
```

Terminal B:

```bash
node src/cli/archipel.mjs msg <node_id_machine_2> "Bonjour jury"
```

Attendu: handshake OK et message affiche cote `machine-2`.

Declenchement assistant en chat:

```bash
node src/cli/archipel.mjs msg <node_id_machine_2> "/ask resumer les derniers echanges"
```

ou

```bash
node src/cli/archipel.mjs msg <node_id_machine_2> "@archipel-ai donne un recapitulatif"
```

Le CLI enverra la requete a Gemini avec contexte des derniers messages (N configurable), puis renverra la reponse dans le chat.

### Cas 3 - Fichier 50 Mo multi-noeuds (Sprint 3)

Verification automatique complete:

```bash
npm run sprint3:full:check
```

Attendu:
- transfert 50 Mo reussi
- deconnexion d'un seed geree (fallback)
- hash final identique

## Validation automatique

```bash
npm run sprint1:check
npm run sprint2:check
npm run sprint3:core:check
npm run sprint3:protocol:check
npm run sprint3:download:check
npm run sprint3:full:check
npm run sprint3:check
npm run sprint3:multi:check
npm run sprint3:corrupt:check
npm run sprint4:cli:check
```

## Gemini (optionnel)

Activation:

```env
ARCHIPEL_AI_ENABLED=true
ARCHIPEL_GEMINI_API_KEY=<your_key>
ARCHIPEL_GEMINI_MODEL=gemini-1.5-flash
```

Exemple:

```bash
node src/cli/archipel.mjs ask --prompt "resume l'etat du noeud"
```

Mode offline strict:

```bash
node src/cli/archipel.mjs ask --prompt "test" --no-ai
```

Contexte chat:
- contexte auto des `ARCHIPEL_AI_CONTEXT_MESSAGES` derniers messages (defaut 12)
- surcharge possible via `--context` ou `--context-messages`

## Limitations connues

- Le chargement automatique de `.env` n'est pas integre (variables a exporter selon shell).
- Le `download <file_id>` suppose que les pairs decouverts exposent leurs chunks sur un port fournisseur commun (defaut `9931`, configurable via `--provider-port`).
- Le Web of Trust est local (endorsement/revocation signes), sans propagation automatique reseau.
- Les tests unitaires dedies `tests/` ne sont pas encore fournis (checks d'integration via `demo/`).

## Equipe et contributions

A completer avant soumission:
- Membre 1: reseau P2P
- Membre 2: crypto + messaging
- Membre 3: transfert + chunking
- Membre 4: integration CLI + docs + demo

## Securite / hygiene repo

- `.env` et `.archipel/` ignores par Git
- cles PEM locales ignorees par Git
- ne jamais versionner de secrets reels
