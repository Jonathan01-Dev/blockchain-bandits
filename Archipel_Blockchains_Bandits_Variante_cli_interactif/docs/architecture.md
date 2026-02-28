# Architecture Archipel

## Vue d'ensemble
```text
+----------------------- LAN (UDP Multicast 239.255.42.99:6000) -----------------------+
|                                                                                        |
|  Node A                               Node B                               Node C      |
|  +---------------------------+        +---------------------------+        +---------+  |
|  | DiscoveryService          |<------>| DiscoveryService          |<------>| ...     |  |
|  | - HELLO                   |        | - HELLO                   |        |         |  |
|  | - PEER_LIST (unicast)     |        | - PEER_LIST (unicast)     |        |         |  |
|  +---------------------------+        +---------------------------+        +---------+  |
|          |                                       |                                      |
|          v                                       v                                      |
|  +---------------------------+        +---------------------------+                      |
|  | PeerTable                 |        | PeerTable                 |                      |
|  | - last_seen, reputation   |        | - last_seen, reputation   |                      |
|  +---------------------------+        +---------------------------+                      |
|                                                                                        |
+---------------------------- TCP pair-a-pair securise (E2E) ----------------------------+
           |                                       |
           v                                       v
+----------------------------+        +----------------------------+
| SecureTcpService           |<------>| SecureTcpService           |
| - HANDSHAKE_HELLO/REPLY    |        | - X25519 + HKDF            |
| - AES-256-GCM (SECURE)     |        | - HMAC-SHA256 paquet       |
| - keepalive PING/PONG      |        | - TrustStore check         |
+----------------------------+        +----------------------------+
           |                                       |
           v                                       v
+----------------------------+        +----------------------------+
| ArchipelNode               |        | ArchipelNode               |
| - msg, send, pull-multi    |        | - CHUNK_REQ/DATA handlers  |
| - rarest-first scheduler   |        | - TRUST_UPDATE handler     |
+----------------------------+        +----------------------------+
           |                                       |
           v                                       v
+----------------------------+        +----------------------------+
| FileTransferManager        |        | FileTransferManager        |
| - manifest/chunks          |        | - resume + assemble        |
| - .archipel/index.db       |        | - replication metadata     |
+----------------------------+        +----------------------------+
```

## Modules
- `src/network/discovery.js`: discovery UDP, HELLO/PEER_LIST.
- `src/network/secureTcp.js`: handshake, tunnel SECURE, HMAC paquet, keepalive.
- `src/crypto/*`: identite Ed25519, session X25519+HKDF, chiffrement AES-GCM, trust store.
- `src/transfer/fileTransfer.js`: manifest, chunks, resume, assemble, index local.
- `src/core/node.js`: orchestration du protocole, CLI operations, multi-source, rarest-first.
- `src/ai/gemini.js`: assistant Gemini optionnel et desactivable.

## Flux critiques
1. Discovery: HELLO multicast -> PEER_LIST unicast -> PeerTable.
2. Session secure: handshake signe -> session key -> tunnel SECURE.
3. Fichier: manifest -> chunk map -> rarest-first + fallback -> assemble + hash global.
4. Trust: TOFU initial -> approve/revoke local -> propagation best-effort des signatures.
