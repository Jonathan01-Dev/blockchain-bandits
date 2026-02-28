# DevPost Submission Text (<=300 words)

## Version FR (a coller)
Archipel est un protocole de communication P2P local, chiffre de bout en bout, concu pour fonctionner sans infrastructure centrale. Notre objectif etait de construire un reseau resilient en environnement contraint: pas de serveur, pas de CA centrale, et echanges fiables entre noeuds sur LAN.

Le prototype implemente:
- decouverte de pairs via UDP multicast,
- transport TCP securise,
- handshake avec verification d'identite (Ed25519),
- derivation de cle de session (X25519 + HKDF),
- chiffrement des payloads (AES-256-GCM),
- verification d'integrite (SHA-256),
- signature des manifests et chunks,
- transfert de fichiers en chunks,
- telechargement multi-sources avec fallback,
- reprise apres interruption (`resume`),
- telemetrie de progression (debit, ETA, retries, timeouts).

Nous avons egalement ajoute une couche de robustesse operationnelle: retries avec backoff exponentiel sur les requetes de chunks, timeout configurable par requete, et tests automatises couvrant les scenarios critiques (smoke standard, multi-source, reprise, retry/timeout).

Le resultat est un prototype demonstrable en moins de 5 minutes devant jury, avec une CLI simple, un guide de demo, et des scripts de verification de bout en bout. Archipel prouve qu'un reseau local decentralise peut rester fonctionnel, verifiable et securise, meme en cas de deconnexion d'une source ou d'interruption de transfert.

## Liens a renseigner
- GitHub: <URL_REPO_PUBLIC>
- Demo/Guide: `demo/DEMO_JURY.md`
