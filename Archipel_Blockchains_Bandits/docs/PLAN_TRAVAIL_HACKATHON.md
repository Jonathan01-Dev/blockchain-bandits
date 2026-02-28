# Plan de travail - Hackathon Archipel

## Sprints

- Sprint 0 (H+0 -> H+2): bootstrap et architecture
- Sprint 1 (H+2 -> H+8): couche reseau P2P
- Sprint 2 (H+8 -> H+13): chiffrement E2E et auth sans CA
- Sprint 3 (H+13 -> H+19): chunking et transfert multi-noeuds
- Sprint 4 (H+19 -> H+23): integration, CLI, README final
- Buffer (H+23 -> H+24): soumission finale

## Suivi execution

| Sprint | Statut | Livrable cle | Preuve |
|---|---|---|---|
| S0 | Fait | README + architecture + format paquet + cles PKI | docs + script keys |
| S1 | Fait | 3 noeuds detectes en <60s | npm run sprint1:check (peer_counts=2,2,2) |
| S2 | Fait | message E2E chiffre + handshake auth | npm run sprint2:check |
| S3 | Fait | transfert 50 Mo 3 noeuds + fallback | npm run sprint3:full:check |
| S4 | A faire | demo <5 min + README final | - |
| Buffer | A faire | devpost + tag final-submission | - |

## Journal d'avancement redaction

- [Sprint 0] Plan cree et aligne sur les consignes officielles.
- [Sprint 1] Couche reseau P2P implementee (UDP discovery + PEER_LIST TCP TLV + peer table persistante + keepalive) et test 3 noeuds valide.
- [Sprint 2] Handshake secure + chiffrement AES-GCM + TOFU implementes et verifies via demo Alice/Bob.
- [Sprint 3] Chunking, protocole CHUNK_REQ/CHUNK_DATA/ACK, download parallel rarest-first, fallback noeud deconnecte et verification SHA-256 finale.
