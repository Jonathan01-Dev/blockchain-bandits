# Architecture Archipel v1

## Schema reseau global

```text
                           LAN OFFLINE (SANS INTERNET)
--------------------------------------------------------------------------------
 Plane de decouverte : UDP multicast 239.255.42.99:6000
   - HELLO periodique
   - reception/merge des pairs
--------------------------------------------------------------------------------
 Plane controle pair-a-pair : TCP TLV
   - PEER_LIST, PING, PONG
--------------------------------------------------------------------------------
 Plane metier :
   - Messagerie E2E (secure-listen / msg)
   - Transfert chunks (CHUNK_REQ / CHUNK_DATA / ACK)
--------------------------------------------------------------------------------

        +--------------------------+       +--------------------------+
        | Noeud A                  |<----->| Noeud B                  |
        |--------------------------|       |--------------------------|
        | CLI / UI                 |       | CLI / UI                 |
        | Messaging (E2E)          |       | Messaging (E2E)          |
        | Transfer (chunking)      |       | Transfer (chunking)      |
        | Network (UDP + TCP)      |       | Network (UDP + TCP)      |
        | Crypto (Ed/X/HKDF/AES)   |       | Crypto (Ed/X/HKDF/AES)   |
        +--------------------------+       +--------------------------+
                 ^                                      ^
                 |---------------> Noeud C <------------|
```

## Schema stockage local par noeud

```text
.archipel/
  keys/                    -> cles Ed25519 locales
  peers-<node>.json        -> table de pairs decouverts
  trust-<node>.json        -> web of trust local
  chat-<node>.jsonl        -> historique des messages
  index.json               -> index manifests/chunks
  manifests/               -> manifests signes
  chunks/<file_id>/        -> blocs de fichiers
  downloads/               -> fichiers reconstruits
```

## Choix techniques (rappel)

- Discovery: UDP multicast (zero configuration locale).
- Transport donnees: TCP sockets.
- Crypto: Ed25519, X25519, HKDF-SHA256, AES-256-GCM, HMAC-SHA256.
- Contrainte: fonctionnement local offline (Gemini optionnelle et isolee).