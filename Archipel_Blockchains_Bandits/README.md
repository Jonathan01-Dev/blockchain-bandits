# Archipel - Blockchains Bandits

Prototype de protocole P2P local chiffre pour le hackathon Archipel.

## Suivi du projet
- `SUIVI_SPRINTS_ARCHIPEL.md`

## Etat actuel
- Sprint 0: termine (bootstrap + docs)
- Sprint 1: termine (discovery UDP + peer table + TCP)

## Stack
- Node.js 20+
- UDP multicast (`dgram`) pour discovery
- TCP (`net`) pour transport de base
- JSON local dans `.archipel/`

## Commandes
```bash
npm run start -- --port 7777
npm run clean:state
npm run test:smoke:s1
```

## CLI Sprint 1
Dans le prompt `archipel>`:
- `peers`
- `status`
- `ping <host> <port>`
- `help`
- `exit`

## Architecture actuelle
- `src/network/discovery.js`: HELLO multicast
- `src/network/peerTable.js`: peers + stale
- `src/network/tcpServer.js`: serveur TCP + ping/pong
- `src/core/node.js`: orchestration noeud
- `src/cli/index.js`: interface utilisateur
