# Archipel - Blockchains Bandits

Protocole P2P local, decentralise, chiffre, sans serveur central.

## Sprint courant

- Sprint 0 termine

## Stack choisie (Sprint 0)

- Runtime: Node.js (>= 20)
- Discovery reseau: UDP multicast
- Transfert reseau: TCP sockets
- Crypto cible:
- Ed25519 (identite/signature)
- X25519 + HKDF-SHA256 (cle de session)
- AES-256-GCM (chiffrement)
- HMAC-SHA256 (integrite)

## Schema architecture

Voir [docs/architecture.md](docs/architecture.md).

## Spec format paquet

Voir [docs/protocol-spec.md](docs/protocol-spec.md).

## Configuration

1. Copier l'environnement:

```powershell
Copy-Item .env.example .env
```

2. Generer les cles locales Ed25519:

```powershell
node src/crypto/generate-keys.mjs --node-name node-1
```

3. (Optionnel) Regenerer en ecrasant:

```powershell
node src/crypto/generate-keys.mjs --node-name node-1 --force
```

## Livrables Sprint 0

- README complete avec stack, architecture et spec paquet
- Architecture documentee (`docs/architecture.md`)
- Specification paquet minimale (`docs/protocol-spec.md`)
- PKI locale: script de generation de cles (`src/crypto/generate-keys.mjs`)
