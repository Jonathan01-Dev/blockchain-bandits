# Archipel - Blockchains Bandits

Prototype de protocole P2P local chiffre pour le hackathon Archipel.

## Suivi du projet
Le suivi sprint par sprint est dans:
- `SUIVI_SPRINTS_ARCHIPEL.md`

## Objectif produit
Construire un reseau local decentralise capable de:
1. decouvrir des pairs sans serveur central,
2. echanger des messages chiffres,
3. transferer des fichiers chunkes verifies,
4. resister aux pannes (fallback/reprise).

## Etat actuel
- Sprint 0 termine: bootstrap + architecture + spec protocole.
- Sprints techniques (reseau, crypto, transfert) a implementer ensuite.

## Arborescence
```text
Archipel_Blockchains_Bandits/
├── src/
│   ├── cli/
│   ├── core/
│   ├── crypto/
│   ├── messaging/
│   ├── network/
│   └── transfer/
├── docs/
├── tests/
├── scripts/
├── demo/
├── .env.example
├── .gitignore
├── package.json
└── SUIVI_SPRINTS_ARCHIPEL.md
```

## Scripts
```bash
npm run start -- --port 7777
npm run clean:state
```

## Choix de stack (Sprint 0)
- Node.js 20+
- Reseau: UDP multicast + TCP (`dgram`, `net`)
- Crypto: `crypto` natif Node (Ed25519, X25519, AES-GCM, HKDF)
- Persistance locale: JSON dans `.archipel/`
- Tests: `node:test` + smoke scripts
