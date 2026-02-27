# Suivi Sprints - Archipel Blockchains Bandits

## Sprint 0 - Bootstrap & Architecture
- Statut: termine
- Realisations:
  - arborescence projet
  - package/config de base
  - docs initiales

## Sprint 1 - Couche reseau P2P
- Statut: termine
- Objectif: discovery UDP + peer table + TCP
- Realisations:
  - discovery multicast sur `239.255.42.99:6000`
  - HELLO periodique + reception des pairs
  - peer table persistable avec statut `online/stale`
  - serveur TCP d'ecoute + reponse `PING -> PONG`
  - CLI interactive (`peers`, `status`, `ping`, `exit`)
  - smoke test 3 noeuds
- Validation:
  - `npm run test:smoke:s1` vert

## Sprint 2 - Chiffrement & Auth
- Statut: pending
- Cible: Ed25519, X25519, HKDF, AES-GCM, trust store

## Sprint 3 - Chunking & Transfert
- Statut: pending
- Cible: manifest, chunks, hash, reprise

## Sprint 4 - Integration & Demo
- Statut: pending
- Cible: CLI complete, telemetry, tests complets

## Buffer - Soumission
- Statut: pending
- Cible: docs finales, tags sprint, texte DevPost
