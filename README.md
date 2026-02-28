# Archipel - Protocole P2P local chiffre

Archipel est un prototype P2P local sans serveur central. Chaque noeud decouvre les pairs sur LAN, etablit un tunnel chiffre de bout en bout, puis echange messages et fichiers chunkes avec verification cryptographique.

## Architecture et choix techniques
- Discovery LAN: UDP multicast `239.255.42.99:6000` (`HELLO` + `PEER_LIST`)
- Transport de donnees: TCP pair-a-pair
- Framing paquet: binaire (MAGIC/TYPE/NODE_ID/PAYLOAD_LEN/PAYLOAD/HMAC)
- Session security: handshake Ed25519 + X25519, derive HKDF-SHA256, tunnel AES-256-GCM
- Integrite paquet: HMAC-SHA256 sur chaque paquet
- Trust model: TOFU + approbation/revocation locale + propagation best-effort de signatures
- Fichiers: manifest signe, chunks signes, hash SHA-256 par chunk + hash global
- Multi-source: `CHUNK_MAP_REQUEST` + ordonnancement rarest-first + fallback + resume
- Replication passive: re-partage automatique des fichiers completes

Schema d'architecture detaille: `docs/architecture.md`.

## Schema ASCII rapide
```text
[HELLO/PEER_LIST UDP] --> [PeerTable] --> [TCP Secure Handshake]
                                      --> [SECURE tunnel AES-GCM + HMAC]
                                      --> [MSG | MANIFEST | CHUNK_REQ/CHUNK_DATA]
                                      --> [FileTransfer + index.db + resume + rarest-first]
```

## Structure
```text
archipel/
├── src/
│   ├── ai/
│   ├── cli/
│   ├── core/
│   ├── crypto/
│   ├── network/
│   └── transfer/
├── docs/
│   ├── protocol-spec.md
│   └── architecture.md
├── tests/
├── scripts/
└── demo/
```

## Prerequis
- Node.js 20+

## Installation (machine fraiche)
```bash
cd archipel
npm install
cp .env.example .env
npm run clean:state
```

## Lancer un noeud
```bash
node src/cli/index.js start --port 7777
```

## Lancer le dashboard web (HTML vanilla)
```bash
npm run start:web
```
Puis ouvrir `http://127.0.0.1:8080`.

Option combinee:
```bash
node src/cli/index.js start --port 7777 --web --web-port 8080
```

Mode web sans prompt CLI:
```bash
node src/cli/index.js start --port 7777 --web --web-port 8080 --web-only
```

Options utiles:
- `--no-ai`: desactive Gemini (mode offline strict)
- `--replication-factor 2`: facteur cible de replication locale

Exemple:
```bash
node src/cli/index.js start --port 7777 --no-ai --replication-factor 2
```

## Commandes CLI
- `peers`
- `msg <peer_id_prefix> <texte>`
- `ask <question>` (Gemini local, si actif)
- `share <filepath>`
- `send <peer_id_prefix> <fichier>`
- `pull <peer_id_prefix> <file_id> [output]`
- `sources <file_id>`
- `pull-multi <file_id> [output] [parallelism]`
- `resume <file_id> [output] [parallelism]`
- `receive`
- `download <file_id> [output]`
- `status`
- `trust`
- `trust <peer_id_prefix> approve`
- `trust <peer_id_prefix> revoke [reason]`

## Guide de demo (3 cas d'usage)
1. Decouverte P2P (3 noeuds)
```bash
node src/cli/index.js start --port 7777
node src/cli/index.js start --port 7778
node src/cli/index.js start --port 7779
```
Puis `peers` sur chaque terminal.

2. Message chiffre
```bash
msg <peer_prefix> Bonjour
```
(Option AI contextuelle)
```bash
msg <peer_prefix> @archipel-ai Resumer l'etat du reseau
```

3. Transfert fichier multi-source 50 Mo
- Sur A et B: `share demo/demo_50mb.bin`
- Sur C: `sources <file_id>` puis `pull-multi <file_id>`
- En cours d'interruption: relancer et `resume <file_id>`
- Verification via `status` (hash final, progression, retries/timeouts)

## Primitives cryptographiques et justification
- Ed25519: identite et signatures robustes et rapides
- X25519: echange de secret ephemeral par connexion (forward secrecy)
- HKDF-SHA256: derivation de cle de session stable
- AES-256-GCM: chiffrement authentifie des payloads
- HMAC-SHA256: integrite de chaque paquet transporte
- SHA-256: empreinte chunks + hash global fichier

## Integration Gemini (optionnelle)
- Variable: `GEMINI_API_KEY`
- Declenchement: `ask <question>` ou messages `@archipel-ai ...` / `/ask ...`
- Desactivation: `--no-ai`
- En cas d'indisponibilite: erreur gracieuse, pas de crash

## Tests
```bash
npm run test:unit
npm run test:smoke
npm run test:smoke:multi
npm run test:smoke:resume
npm run test:smoke:retry
```

## Limitations connues et ameliorations
- Propagation Web of Trust simplifiee (pas de consensus/reseau de confiance complet)
- Anti-rejeu de session base sur timestamp (pas encore sequence globale durable)
- Ordonnancement rarest-first base sur maps courantes (pas de predictive scheduling)
- Index local `index.db` au format JSON (pas SQLite)
- UI web non implementee (CLI priorisee)

## Membres et contributions
- Daniel: implementation du prototype (reseau P2P, crypto, transfert multi-source, CLI, tests, documentation).

## Utilitaires
- `npm run clean:state`: nettoie peers/trust/downloads/index
- `./demo/run_demo_checks.sh`: enchaine les checks de demo
