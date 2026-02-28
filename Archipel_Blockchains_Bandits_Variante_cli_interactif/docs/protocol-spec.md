# Archipel Protocol Spec (MVP+)

## 1. Contraintes
- Reseau local uniquement
- Sans serveur central
- Chiffrement de bout en bout sur TCP
- Integrite HMAC-SHA256 sur chaque paquet

## 2. Format de paquet (binaire)
Chaque paquet utilise le framing suivant:
- `MAGIC`: 4 bytes (`ARCP`)
- `VERSION`: 1 byte
- `TYPE`: 1 byte
- `NODE_ID`: 32 bytes (sha256 public key)
- `PAYLOAD_LEN`: uint32 BE
- `PAYLOAD`: JSON UTF-8
- `HMAC`: 32 bytes (SHA-256)

`TYPE` principaux:
- `HELLO`, `PEER_LIST`
- `HANDSHAKE_HELLO`, `HANDSHAKE_REPLY`, `SECURE`
- `PING`, `PONG`

## 3. Decouverte de pairs
- Transport: UDP multicast
- Groupe: `239.255.42.99`
- Port: `6000`
- Message periodique: `HELLO` toutes les 30 secondes
- Reponse `PEER_LIST`: retour unicast avec pairs connus
- Timeout pair: 90 secondes sans `HELLO`

Exemple `HELLO.payload`:
```json
{
  "tcpPort": 7777,
  "publicKeyPem": "-----BEGIN PUBLIC KEY-----...",
  "sharedFileIds": ["sha256_file_a", "sha256_file_b"],
  "ts": 1700000000000
}
```

## 4. Handshake securise (TCP)
Sequence:
1. Client -> Server: `HANDSHAKE_HELLO` (Ed25519 signe)
2. Server verifie signature + TOFU/Web of Trust local
3. Server -> Client: `HANDSHAKE_REPLY` (Ed25519 signe)
4. Client verifie signature + TOFU/Web of Trust local
5. Les deux derivent la meme cle de session via X25519 + HKDF
6. Les messages applicatifs passent en `SECURE` (AES-256-GCM)
7. Keep-alive `PING/PONG` toutes les 15s

## 5. Payload securise
Trame `SECURE.payload`:
```json
{
  "encrypted": {
    "nonce": "base64",
    "ciphertext": "base64",
    "authTag": "base64"
  }
}
```

Payload JSON dechiffre (exemples):
- `MSG`
- `MANIFEST_OFFER`
- `FILE_INFO_REQUEST`
- `CHUNK_REQ`
- `CHUNK_DATA`
- `CHUNK_MAP_REQUEST`
- `ASSEMBLE_REQUEST`
- `TRUST_UPDATE`

## 6. Web of Trust simplifie
- TOFU au premier contact
- `trust <peer> approve` pour validation explicite
- `trust <peer> revoke` pour blocage local
- Propagation best-effort des signatures via `TRUST_UPDATE`

## 7. Transfert fichier
### Manifest
```json
{
  "fileId": "sha256_fichier",
  "filename": "demo.bin",
  "size": 52428800,
  "chunkSize": 524288,
  "nbChunks": 100,
  "chunks": [{ "index": 0, "size": 524288, "hash": "sha256_chunk" }],
  "senderId": "node_id",
  "senderPublicKeyPem": "-----BEGIN PUBLIC KEY-----...",
  "signature": "base64",
  "replicationFactorTarget": 2
}
```

Verification:
- hash chunk obligatoire a la reception
- hash global verifie a l'assemblage final
- signature du manifest verifiee
- signature du chunk verifiee (`fileId`, `chunkIndex`, `hash`, `size`, `senderId`)

Mode multi-source:
- `sources` detecte les pairs en ligne via `HELLO.sharedFileIds`
- `CHUNK_MAP_REQUEST` recupere la disponibilite chunk par source
- ordonnancement `rarest-first` (les chunks les moins disponibles d'abord)
- fallback automatique sur autre source
- retries + backoff exponentiel cote receveur

Mode resume:
- les chunks deja presents dans `.archipel/downloads/<file_id>/` sont detectes
- seuls les chunks manquants sont redemandes

## 8. Stockage local
- `.archipel/keys/` : identite noeud
- `.archipel/trust-store.json` : TOFU + approbations + revocations
- `.archipel/peers.json` : pairs connus
- `.archipel/downloads/` : chunks + fichiers assembles
- `.archipel/index.db` : index local des chunks/fichiers (JSON)
