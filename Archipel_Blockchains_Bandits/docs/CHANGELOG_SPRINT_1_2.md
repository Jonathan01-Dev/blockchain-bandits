# Changelog - Sprint 1 a Sprint 2

## Periode

- Sprint 1: Couche reseau P2P
- Sprint 2: Chiffrement E2E et authentification sans CA

## Sprint 1

### Objectif

Mettre en place la decouverte de pairs et la base reseau P2P.

### Changements principaux

- Ajout du noeud reseau P2P (`ArchipelNode`) avec:
- discovery UDP multicast
- peer table avec persistance JSON
- timeout de pair
- serveur TCP et echange `PEER_LIST`
- keep-alive `PING/PONG`
- Ajout du CLI de lancement de noeud.
- Ajout du script de validation automatique 3 noeuds.
- Mise a jour de la documentation (README + plan de travail).

### Fichiers cles

- `src/network/archipel-node.mjs`
- `src/network/constants.mjs`
- `src/network/packet.mjs`
- `src/network/tcp-frame.mjs`
- `src/network/peer-table.mjs`
- `src/network/identity.mjs`
- `src/cli/archipel.mjs`
- `demo/sprint1-check.mjs`

### Validation

- `npm run sprint1:check`
- attendu: `peer_counts=2,2,2` puis `Sprint 1 check passed`

## Sprint 2

### Objectif

Ajouter un canal chiffre E2E et authentifie sans CA centrale.

### Changements principaux

- Ajout d'un noeud securise (`SecureNode`) avec handshake:
- `HELLO -> HELLO_REPLY -> AUTH -> AUTH_OK`
- Primitives crypto:
- Ed25519 (identite/signature)
- X25519 (echange de cle)
- HKDF-SHA256 (derive session)
- AES-256-GCM (chiffrement message)
- Web of Trust simplifie (TOFU):
- stockage local des cles de pairs
- verification de coherence aux reconnexions
- Ajout du script de validation machine-1 -> machine-2.

### Fichiers cles

- `src/messaging/secure-node.mjs`
- `src/messaging/trust-store.mjs`
- `src/crypto/keyring.mjs`
- `demo/sprint2-check.mjs`
- `README.md`
- `package.json`
- `docs/PLAN_TRAVAIL_HACKATHON.md`

### Validation

- `npm run sprint2:check`
- attendu:
- machine-2 dechiffre le message de machine-1
- `Sprint 2 check passed`
- le plaintext n'apparait pas dans `wireHex`
