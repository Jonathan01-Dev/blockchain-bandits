# Archipel Protocol Spec - Sprint 0

## Contraintes du sujet
- Fonctionnement local LAN, sans Internet.
- Zero serveur central (pas de tracker, pas de CA centrale).
- Chiffrement bout-en-bout obligatoire.

## Transport cible
- Discovery: UDP multicast `239.255.42.99:6000`.
- Donnees: TCP point-a-point.

## Format logique de paquet (cible)
- `MAGIC` (4 bytes)
- `TYPE` (1 byte)
- `NODE_ID` (32 bytes)
- `PAYLOAD_LEN` (uint32)
- `PAYLOAD`
- `SIGNATURE/HMAC`

## Types de messages cibles
- `HELLO`: annonce presence noeud
- `PEER_LIST`: pairs connus
- `MSG`: message chiffre
- `MANIFEST`: metadonnees fichier
- `CHUNK_REQ`: requete chunk
- `CHUNK_DATA`: donnees chunk
- `ACK`: acquittement

## Cryptographie cible
- Identite: Ed25519 (signature)
- Echange cle: X25519
- Derivation: HKDF-SHA256
- Chiffrement: AES-256-GCM
- Integrite fichier/chunks: SHA-256

## Transfert fichier cible
1. Emission d'un `MANIFEST` signe.
2. Telechargement des chunks (single source puis multi-source).
3. Verification hash chunk par chunk.
4. Reassemblage + verification hash final.
5. Reprise si interruption.
