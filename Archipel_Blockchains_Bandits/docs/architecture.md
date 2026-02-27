# Architecture - Sprint 0

## Modules
- `src/cli`: interface utilisateur (commandes)
- `src/core`: constantes, outils communs
- `src/network`: discovery UDP, peer table, TCP secure
- `src/crypto`: identite, handshake, sessions, trust store
- `src/messaging`: messages E2E
- `src/transfer`: manifest, chunks, assemble, resume

## Flux cible
1. Le noeud demarre et rejoint le groupe multicast.
2. Les noeuds s'annoncent via `HELLO`.
3. Connexion TCP entre pairs.
4. Handshake signe + cle de session.
5. Echanges applicatifs chiffres.
6. Transfert chunk par chunk avec verification.

## Stockage local
- `.archipel/keys/`: identites locales
- `.archipel/peers.json`: peers connus
- `.archipel/trust-store.json`: TOFU/trust
- `.archipel/downloads/`: chunks et fichiers
