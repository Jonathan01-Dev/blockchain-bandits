# Archipel Protocol Spec v1

## Objectif

Definir un protocole P2P local, decentralise, chiffre de bout en bout.

## Transports

- Discovery: UDP multicast `239.255.42.99:6000`
- Controle pair-a-pair: TCP TLV (`PEER_LIST`, `PING`, `PONG`)
- Messaging E2E: canal secure base sur handshake + AES-GCM
- Transfer: protocole chunks (`CHUNK_REQ`, `CHUNK_DATA`, `ACK`)

## Format paquet binaire minimal (Archipel Packet v1)

```text
+------------------------------------------------------------------+
|                          ARCHIPEL PACKET v1                      |
+----------+----------+-------------+------------------------------+
| MAGIC    | TYPE     | NODE_ID     | PAYLOAD_LEN                  |
| 4 bytes  | 1 byte   | 32 bytes    | 4 bytes (uint32 big-endian)  |
+----------+----------+-------------+------------------------------+
| PAYLOAD (chiffre, longueur variable)                             |
+------------------------------------------------------------------+
| HMAC-SHA256 SIGNATURE (32 bytes)                                 |
+------------------------------------------------------------------+
```

- `MAGIC`: `ARCP`
- `PAYLOAD_LEN`: taille du payload en uint32 big-endian

## Types de paquets

- `0x01 HELLO`      : annonce de presence
- `0x02 PEER_LIST`  : liste de pairs connus
- `0x03 MSG`        : message chiffre
- `0x04 CHUNK_REQ`  : demande de chunk
- `0x05 CHUNK_DATA` : envoi de chunk
- `0x06 MANIFEST`   : metadonnees fichier
- `0x07 ACK`        : acquittement

## Parametres de base

- HELLO toutes les 30 secondes
- Pair considere inactif apres 90 secondes sans HELLO
- Keep-alive TCP toutes les 15 secondes

## Schema sequence simplifiee

```text
A --HELLO(UDP mcast)-------------------------> LAN
B --------------------detecte A--------------> B
B --PEER_LIST(TCP)-> A
A <-> B : PING/PONG (TCP)
A <-> B : MSG secure (E2E)
A <-> B : CHUNK_REQ / CHUNK_DATA / ACK
```

## Primitives crypto cible

- Ed25519: identite + signatures
- X25519: echange de cle de session
- HKDF-SHA256: derivation de cle
- AES-256-GCM: chiffrement/authentification des donnees
- HMAC-SHA256: integrite des paquets