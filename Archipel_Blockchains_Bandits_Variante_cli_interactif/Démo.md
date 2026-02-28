Script démo jury (5 min, prêt à lire)

  1. Préparation (avant passage jury)

  cd /home/daniel/Bureau/archipel
  npm install
  npm run clean:state
  dd if=/dev/urandom of=demo/demo_50mb.bin bs=1M count=50

  2. Lancer 3 nœuds (3 terminaux)
     Terminal A:

  node src/cli/index.js start --port 7777 --no-ai

  Terminal B:

  node src/cli/index.js start --port 7778 --no-ai

  Terminal C:

  node src/cli/index.js start --port 7779 --no-ai

  3. Cas 1: découverte P2P
     Dans A, B, C:

  peers

  Phrase jury:
  “Chaque nœud découvre automatiquement les autres via UDP multicast, sans
  serveur central.”

  4. Cas 2: message chiffré
     Dans A:

  msg <prefix_node_B> Bonjour_jury

  Phrase jury:
  “Le message passe dans un tunnel chiffré E2E avec handshake signé, puis AES-
  GCM.”

  5. Cas 3: transfert multi-sources 50 Mo
     Dans A:

  share demo/demo_50mb.bin

  Dans B:

  share demo/demo_50mb.bin

  Dans C:

  sources <file_id>
  pull-multi <file_id>

  Phrase jury:
  “C télécharge en parallèle depuis plusieurs sources, avec fallback
  automatique.”

  6. Montrer intégrité + état
     Dans C:

  status
  receive

  Phrase jury:
  “Chaque chunk est vérifié, puis hash global final confirmé à l’assemblage.”

  7. Bonus reprise
     Pendant un pull-multi, interrompre C (Ctrl+C), relancer C puis:

  resume <file_id>

  Phrase jury:
  “La reprise ne retélécharge que les chunks manquants.”

  8. Clôture (15 secondes)
     “Archipel fonctionne en LAN souverain, sans Internet, sans serveur central,
     avec chiffrement bout-en-bout, Web of Trust, et transfert multi-nœuds
     résilient.”


