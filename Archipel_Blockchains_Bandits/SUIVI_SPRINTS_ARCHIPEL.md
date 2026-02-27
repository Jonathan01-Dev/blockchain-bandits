# Suivi Sprints - Archipel Blockchains Bandits

## Sprint 0 - Bootstrap & Architecture
- Statut: termine
- Objectif: poser une base propre et documentee
- Realisations:
  - arborescence projet creee (`src`, `docs`, `tests`, `scripts`, `demo`)
  - `package.json` initialise
  - `.gitignore` et `.env.example` crees
  - constantes techniques de base dans `src/core/constants.js`
  - CLI placeholder `src/cli/index.js`
  - script `scripts/clean_state.sh`
  - docs initiales (`README.md`, `docs/protocol-spec.md`, `docs/architecture.md`)
- Validation:
  - `npm run start -- --port 7777` OK (bootstrap message)
  - `npm run clean:state` OK

## Sprint 1 - Couche reseau P2P
- Statut: pending
- Cible: discovery UDP + peer table + TCP

## Sprint 2 - Chiffrement & Auth
- Statut: pending
- Cible: handshake, session key, E2E

## Sprint 3 - Chunking & Transfert
- Statut: pending
- Cible: manifest, chunk req/data, hash, reprise

## Sprint 4 - Integration & Demo
- Statut: pending
- Cible: CLI complete, telemetry, tests, guide demo

## Buffer - Soumission
- Statut: pending
- Cible: final-submission + texte DevPost + tags sprint
