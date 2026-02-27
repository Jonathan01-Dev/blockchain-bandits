# Architecture Archipel v1 (Sprint 0)

```text
                          LAN OFFLINE
 -------------------------------------------------------------------
  UDP multicast 239.255.42.99:6000 : discovery HELLO / PEER_LIST
 -------------------------------------------------------------------
       |                           |                           |
  +----v----------------+     +----v----------------+     +----v----------------+
  | Node A              |     | Node B              |     | Node C              |
  |---------------------|     |---------------------|     |---------------------|
  | CLI                 |     | CLI                 |     | CLI                 |
  | Messaging           |     | Messaging           |     | Messaging           |
  | Transfer            |     | Transfer            |     | Transfer            |
  | Network UDP/TCP     |     | Network UDP/TCP     |     | Network UDP/TCP     |
  | Crypto              |     | Crypto              |     | Crypto              |
  +----+----------------+     +----+----------------+     +----+----------------+
       |                           |                           |
       +----------- TCP sessions chiffrées E2E ----------------+

Stockage local par noeud:
  .archipel/
    keys/      -> cles locales
    index.db   -> index chunks (S3)
```

## Choix Sprint 0

- Discovery: UDP multicast (zero configuration locale).
- Transport donnees: TCP sockets.
- Crypto cible: Ed25519, X25519 + HKDF-SHA256, AES-256-GCM, HMAC-SHA256.
- Aucun secret en clair dans le repo.
