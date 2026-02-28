# Avancement du projet Archipel

## Date de suivi
- Derniere mise a jour: 27 fevrier 2026

## Objectif global
Construire un protocole P2P local chiffre, sans serveur central, avec messagerie et transfert de fichiers chunkes, puis livrer une demo jury reproductible.

## Ce qui est deja fait

## 1) Base projet et architecture
- Structure de projet creee (`src`, `docs`, `scripts`, `.archipel`).
- CLI interactive operationnelle.
- Documentation initiale (`README.md`, `docs/protocol-spec.md`).

## 2) Couche reseau P2P
- Decouverte de pairs via UDP multicast (`239.255.42.99:6000`).
- Peer table en memoire + persistance (`.archipel/peers.json`).
- Serveur TCP securise pour echanges point-a-point.
- Purge automatique des pairs trop anciens (evite la pollution historique en demo).

## 3) Securite
- Identite de noeud avec cle Ed25519 persistante.
- Handshake signe et verifie (anti usurpation basique).
- Derivation de cle de session via X25519 + HKDF.
- Chiffrement des payloads via AES-256-GCM.
- Trust store TOFU (`.archipel/trust-store.json`) pour detecter les changements de cle.
- Signatures des manifests et chunks avec verification cote receveur.
- Verification temporelle du handshake (fenetre anti-rejeu basique).

## 4) Messagerie chiffree
- Envoi/reception de messages chiffres entre pairs.
- ACK de reception.

## 5) Transfert de fichiers
- Generation de manifest (hash global + hash par chunk).
- Reception de chunks avec verification SHA-256.
- Assemblage final + verification hash global.
- Deux modes supportes:
  - push (`send`)
  - pull via protocole `CHUNK_REQ` (`share` + `pull`)
  - pull multi-sources parallele avec fallback (`pull-multi`)
- Reprise apres interruption:
  - detection des chunks deja presents
  - telechargement uniquement des chunks manquants (`resume`)
- Resilience de transfert:
  - retries sur `CHUNK_REQ`
  - backoff exponentiel
  - compteurs retries/timeouts exposes dans `status`

## 6) Commandes CLI disponibles
- `peers`
- `msg <peer> <texte>`
- `share <filepath>`
- `send <peer> <filepath>`
- `pull <peer> <file_id> [output]`
- `sources <file_id>`
- `pull-multi <file_id> [output] [parallelism]`
- `resume <file_id> [output] [parallelism]`
- `receive`
- `download <file_id> [output]`
- `status`
- `trust`

## 6.1) Telemetrie ajoutee
- `status` expose des metriques de transfert par fichier:
  - chunks recus/manquants
  - bytes recus/total
  - progression en pourcentage
  - debit moyen et ETA
  - nombre de sources online
  - retries cumulés et timeouts reseau

## 7) Tests
- Tests unitaires `tests/unit.test.js` passes:
  - signature valide/invalide
  - reprise chunks
  - timestamp stale
  - purge peers anciens
- Test de fumee automatise `scripts/smoke.js` passe.
- Test de fumee multi-sources `scripts/smoke_multi.js` passe.
- Test de fumee reprise `scripts/smoke_resume.js` passe.
- Test de fumee retry/timeout `scripts/smoke_retry.js` passe.
- Script de validation globale demo `demo/run_demo_checks.sh` passe.
- Scenarios verifies: decouverte, message chiffre, transfert push, transfert pull, multi-sources + failover, reprise apres interruption, retry/timeout, hash final valide.

## Ce qui est en cours
- Consolidation/fiabilisation du multi-sources (ordonnancement des chunks et anti-regression).

## Ce qu'il reste a faire (priorise)

## Priorite 1 - Critiques pour la note
- Repetition complete de demo sur reseau cible (conditions jury).
- Verrouiller prefixes/noeuds et script oral court.

## Priorite 2 - Securite/fiabilite
- Ajouter rotation explicite de cles ephemeres (timestamp/fenetre de base deja presente).
- Affiner la gestion d'erreurs (classification timeout/network/signature pour logs jury).

## Priorite 3 - Qualite projet
- Ajouter tests unitaires supplementaires (timeouts/retries/cas erreurs signatures).
- Renforcer `README.md` avec procedure machine fraiche complete.
- Generer tags sprint (`sprint-0` a `sprint-4`) sur des jalons valides.

## Plan d'execution propose (prochaines heures)
1. Rejouer scenario 3 noeuds en conditions reelles (reseau de la salle).
2. Etendre tests unitaires (cas erreurs/rejeu/timeout).
3. Nettoyer les donnees locales de test pour demo propre.
4. Verrouiller les prefixes/noeuds utilises en demo.
5. Tagger jalons sprint et finaliser soumission.

## Risques identifies
- Complexite multi-source dans le temps limite.
- Regression possible sur flux deja stable (push/pull).
- Demo fragile si tests 3 noeuds insuffisants.

## Strategie anti-risque
- Garder le flux actuel stable comme fallback.
- Integrer fonctionnalites incrementales + test apres chaque ajout.
- Prioriser robustesse avant optimisation.

## Etat actuel resume
- Prototype fonctionnel et demonstrable.
- Exigences coeur couvertes: P2P local, chiffrement, message, transfert chunk, verification hash, multi-sources basique.
- Prochain objectif: niveau "jury-ready" sur telemetrie et scenario de demo verrouille.
