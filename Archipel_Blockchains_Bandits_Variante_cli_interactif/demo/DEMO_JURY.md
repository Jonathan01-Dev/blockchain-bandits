# Demo Jury - 5 minutes (Archipel)

## Objectif
Montrer en 5 minutes:
1. decouverte P2P locale,
2. message chiffre,
3. transfert multi-sources avec reprise possible,
4. verification integrite finale.

## Preparation (avant jury)
1. Ouvrir 3 terminaux.
2. Dans chaque terminal:
```bash
cd /home/daniel/Bureau/archipel
```
3. Nettoyer l'etat local:
```bash
npm run clean:state
```
4. Creer un fichier de demo (50 Mo conseille):
```bash
dd if=/dev/urandom of=demo/demo_50mb.bin bs=1M count=50
```
5. Option check rapide:
```bash
./demo/run_demo_checks.sh
```

## Etape 1 - Lancer 3 noeuds
Terminal A:
```bash
node src/cli/index.js start --port 7777
```
Terminal B:
```bash
node src/cli/index.js start --port 7778
```
Terminal C:
```bash
node src/cli/index.js start --port 7779
```

## Etape 2 - Prouver la decouverte
Dans A, B, C:
```bash
peers
```
Attendu:
- chaque noeud voit les autres (`online`).

## Etape 3 - Prouver le message chiffre
Dans A:
```bash
msg <prefix_node_B> Bonjour_jury
```
Attendu:
- B affiche reception message,
- ACK cote A.

## Etape 4 - Partager depuis 2 sources
Dans A:
```bash
share demo/demo_50mb.bin
```
Dans B:
```bash
share demo/demo_50mb.bin
```
Dans C:
```bash
sources <file_id>
```
Attendu:
- C voit au moins 2 sources online.

## Etape 5 - Telechargement multi-sources
Dans C:
```bash
pull-multi <file_id>
```
Attendu:
- transfert termine,
- assemblage OK,
- hash final == hash attendu.

## Etape 6 - Montrer la telemetrie
Dans C:
```bash
status
```
Montrer:
- progress %,
- chunks recus/manquants,
- debit moyen,
- ETA,
- sourcesOnline.

## Etape 7 - Cas reprise (optionnel bonus)
Interrompre un pull en cours (`Ctrl+C`), relancer noeud C, puis:
```bash
resume <file_id>
```
Attendu:
- reprise des chunks manquants sans repartir de zero.

## Pitch final (15-20s)
"Archipel fonctionne sans serveur central, chiffre les echanges de bout en bout, transfere des fichiers verifies par hash/signature, et resiste a la perte d'une source grace au multi-source avec reprise."
