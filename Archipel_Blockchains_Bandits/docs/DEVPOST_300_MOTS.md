# DevPost - Description (<= 300 mots)

Archipel est un prototype de protocole P2P local, decentralise et chiffre de bout en bout, concu pour fonctionner sans serveur central et sans dependance Internet pendant la demo. Chaque noeud agit comme client et serveur.

Le systeme repose sur trois couches principales. D'abord, une couche reseau locale avec decouverte automatique des pairs via UDP multicast et echange de metadonnees via TCP (PEER_LIST, keepalive). Ensuite, une couche de messagerie securisee avec authentification sans CA (TOFU/Web of Trust local), handshake inspire de Noise (Ed25519 + X25519 + HKDF), puis chiffrement AES-256-GCM des messages. Enfin, une couche de transfert fichier inspiree du modele BitTorrent: generation d'un manifest signe, segmentation en chunks, telechargement parallele, verification SHA-256 par chunk et verification finale du hash global.

Le projet valide les scenarios suivants: decouverte multi-noeuds, message E2E chiffre, transfert de fichier 50 Mo avec reprise automatique en cas de deconnexion d'un pair. Des checks automatises couvrent les sprints (S1 a S4), y compris des cas resilients (fallback) et des cas d'integrite (chunk corrompu).

Techniquement, nous avons privilegie des primitives standards et robustes, sans algorithme cryptographique maison. Le prototype est documente avec un README executable pas a pas, des scripts de demo et un plan de passage jury en moins de 5 minutes.

Limites actuelles: le Web of Trust reste local (pas de propagation reseau complete), et l'integration IA Gemini est optionnelle/desactivable pour conserver un mode offline strict.
