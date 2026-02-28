# Scenario Demo Jury (<= 5 minutes)

## Objectif

Prouver rapidement les 3 axes du sujet:
- reseau local decentralise
- chiffrement E2E
- transfert fichier 50 Mo resilient

## Preparation avant passage jury

- 3 terminaux prets pour `start` (ports 7777/7778/7779)
- 2 terminaux prets pour `secure-listen`/`msg`
- 1 terminal pret pour `npm run sprint3:full:check`
- `.env` charge avec la meme `ARCHIPEL_DISCOVERY_HMAC_KEY` sur toutes les machines de demo

## Script minute par minute

### 0:00 -> 1:20 - Discovery P2P

```bash
node src/cli/archipel.mjs start --node-name machine-1 --port 7777
node src/cli/archipel.mjs start --node-name machine-2 --port 7778
node src/cli/archipel.mjs start --node-name machine-3 --port 7779
```

Verification:

```bash
node src/cli/archipel.mjs peers --node-name machine-1
node src/cli/archipel.mjs status --node-name machine-1
```

Message attendu: peer table non vide et 3 noeuds detectes.

### 1:20 -> 2:40 - Message E2E

Terminal A:

```bash
node src/cli/archipel.mjs secure-listen --node-name machine-2 --port 8802
```

Terminal B:

```bash
node src/cli/archipel.mjs msg --node-name machine-1 --to-host 127.0.0.1 --to-port 8802 --message "Bonjour jury"
```

Message attendu: handshake OK + message lisible uniquement cote app.

### 2:40 -> 4:30 - Transfert 50 Mo resilient

```bash
npm run sprint3:full:check
```

Message attendu:
- deconnexion d'un seed en cours
- transfert termine quand meme
- hash final identique

### 4:30 -> 5:00 - Cloture

- rappeler les primitives: Ed25519, X25519, HKDF, AES-GCM, HMAC, SHA-256
- rappeler les limites connues (README)

## Plan de secours

Si multicast LAN bloque:
- executer direct `npm run sprint1:check`, `npm run sprint2:check`, `npm run sprint3:full:check` sur une machine.
- montrer les logs de validation et les scripts de demo.
