# Archipel Protocol Spec v1 (Sprint 0)

## Objectif

Definir un protocole P2P local, decentralise, chiffre de bout en bout.

## Transports

- Discovery: UDP multicast `239.255.42.99:6000`
- Data: TCP (defaut `7777`)

## Format paquet binaire minimal

```text
+----------------+---------+-----------+------------------+
| MAGIC (4 bytes)| TYPE(1) | NODE_ID32 | PAYLOAD_LEN (4B) |
+----------------+---------+-----------+------------------+
| PAYLOAD (longueur variable)                              |
+----------------------------------------------------------+
| HMAC-SHA256 (32 bytes)                                   |
+----------------------------------------------------------+
```

- `MAGIC`: `ARCP`
- `PAYLOAD_LEN`: uint32 big-endian

## Types de paquets

- `0x01 HELLO`
- `0x02 PEER_LIST`
- `0x03 MSG`
- `0x04 CHUNK_REQ`
- `0x05 CHUNK_DATA`
- `0x06 MANIFEST`
- `0x07 ACK`

## Parametres de base

- HELLO toutes les 30 secondes
- Pair considere mort apres 90 secondes sans HELLO
- Keep-alive TCP toutes les 15 secondes

## Primitives crypto cible (Sprint 2)

- Ed25519: identite + signatures
- X25519: echange de cle
- HKDF-SHA256: derive de cle session
- AES-256-GCM: chiffrement data
- HMAC-SHA256: integrite paquets
