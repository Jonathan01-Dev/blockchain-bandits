# Mode d'emploi CLI - Sprint 4 (Archipel)

donne une routine de test complete, commande par commande, pour valider les fonctionnalites du Sprint 4 en terminal.

## 0. Contexte et regles importantes

1. Toutes les commandes ci-dessous s'executent depuis la racine du projet:
- `c:\Users\JeanA\Documents\GitHub\blockchain-bandits\Archipel_Blockchains_Bandits`

2. Ce projet ne charge pas automatiquement `.env`:
- il faut charger les variables dans **chaque terminal** utilise.

3. Les commandes longues (`start`, `secure-listen`, `receive --listen`) doivent tourner dans des terminaux dedies.

4. Ne reutilise pas un terminal deja occupe par un service long pour lancer une commande ponctuelle.

## 1. Preparation unique du projet

### 1.1 Installation

```bash
npm install
```

### 1.2 Creation du fichier `.env`

Exemple minimal (offline + option Gemini):

```env
ARCHIPEL_DISCOVERY_HMAC_KEY=change-me-in-lan
ARCHIPEL_NODE_NAME=machine-1
ARCHIPEL_TCP_PORT=7777
ARCHIPEL_AI_ENABLED=true
ARCHIPEL_GEMINI_API_KEY=<ta_cle>
ARCHIPEL_GEMINI_MODEL=gemini-2.0-flash
ARCHIPEL_AI_CONTEXT_MESSAGES=12
```

### 1.3 Chargement `.env` dans un terminal PowerShell

A executer dans **chaque terminal** que tu ouvres:

```powershell
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
  $name, $value = $_ -split '=', 2
  [System.Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), "Process")
}
```

Verification immediate:

```powershell
echo $env:ARCHIPEL_DISCOVERY_HMAC_KEY
echo $env:ARCHIPEL_AI_ENABLED
echo $env:ARCHIPEL_GEMINI_MODEL
echo ($env:ARCHIPEL_GEMINI_API_KEY.Length)
```

### 1.4 Generation des cles des noeuds

```bash
node src/crypto/generate-keys.mjs --node-name machine-1 --force
node src/crypto/generate-keys.mjs --node-name machine-2 --force
node src/crypto/generate-keys.mjs --node-name machine-3 --force
```

Attendu:
- creation des fichiers PEM dans `.archipel/keys/`

## 2. Plan de terminaux (obligatoire)

Utilise au minimum 6 terminaux:

1. `T1`: reseau `machine-1`
2. `T2`: reseau `machine-2`
3. `T3`: reseau `machine-3`
4. `T4`: listener secure de `machine-2`
5. `T5`: provider chunks de `machine-1`
6. `T6`: commandes ponctuelles (`status`, `peers`, `msg`, `send`, `receive`, `download`, `trust`, `ask`)

Dans **T1..T6**, charge d'abord `.env` (section 1.3).

## 3. Demarrage reseau multi-noeuds

### 3.1 Lancer les noeuds de discovery

Terminal `T1`:

```bash
node src/cli/archipel.mjs start --node-name machine-1 --port 7777
```

Terminal `T2`:

```bash
node src/cli/archipel.mjs start --node-name machine-2 --port 7778
```

Terminal `T3`:

```bash
node src/cli/archipel.mjs start --node-name machine-3 --port 7779
```

Attendu:
- logs `discovery listening...`
- logs `tcp server listening...`
- puis logs `HELLO` / `peer list merged`

### 3.2 Attendre la decouverte

Attendre 30 a 60 secondes.

Verification dans `T6`:

```bash
node src/cli/archipel.mjs peers --node-name machine-1
```

Attendu:
- `peers=2`

Si `peers=0`:
1. verifier que `T1/T2/T3` tournent bien,
2. verifier meme `ARCHIPEL_DISCOVERY_HMAC_KEY` dans tous les terminaux,
3. attendre encore 30 secondes.

## 4. Routine Sprint 4 - commandes minimales PDF

## 4.1 `start --port`

Commande deja validee en section 3.1.

## 4.2 `peers`

```bash
node src/cli/archipel.mjs peers --node-name machine-1
```

Attendu:
- `peers>=1` (idealement 2)

## 4.3 `status`

```bash
node src/cli/archipel.mjs status --node-name machine-1
```

Attendu:
- `node_id=...`
- `peers=...`
- `trusted_keys=...`
- `manifests=...`

## 4.4 `msg <node_id> "Hello!"`

### Etape A: demarrer l'ecoute cible

Terminal `T4`:

```bash
node src/cli/archipel.mjs secure-listen --node-name machine-2 --port 8802
```

### Etape B: recuperer le node_id cible

Dans `T6`:

```bash
node src/cli/archipel.mjs status --node-name machine-2
```

Copier la valeur `node_id=...` de `machine-2`.

### Etape C: envoyer depuis machine-1

```bash
node src/cli/archipel.mjs msg <NODE_ID_MACHINE_2> "Bonjour depuis machine-1" --node-name machine-1 --to-port 8802
```

Attendu:
- dans `T6`: `secure-send ok ...`
- dans `T4`: message recu `[secure-message] ...`

Si erreur `peer table empty`:
- reprendre section 3.2 (discovery pas prete)

## 4.5 `send <node_id> <filepath>`

### Etape A: preparer un fichier de test (si besoin)

Dans `T6` (PowerShell):

```powershell
"fichier de test archipel" | Out-File -Encoding utf8 .\demo-file.txt
```

### Etape B: envoyer l'offre fichier vers machine-2

```bash
node src/cli/archipel.mjs send <NODE_ID_MACHINE_2> demo-file.txt --node-name machine-1 --to-port 8802
```

Attendu:
- `file_id=...`
- `manifest_path=...`
- `file offer sent ...`

## 4.6 `receive`

```bash
node src/cli/archipel.mjs receive --node-name machine-1
```

Attendu:
- `available_files=...`
- liste des `file_id`

Note:
- ici on liste les fichiers connus localement par le noeud choisi.

## 4.7 `download <file_id>`

### Etape A: demarrer un provider chunks sur machine-1

Terminal `T5`:

```bash
node src/cli/archipel.mjs receive --listen --node-name machine-1 --port 9931
```

### Etape B: telecharger depuis machine-2

Dans `T6`:

```bash
node src/cli/archipel.mjs download <FILE_ID> --node-name machine-2 --peer <NODE_ID_MACHINE_1>@127.0.0.1:9931
```

Attendu:
- `download ok file_id=...`
- `output_path=...`
- `file_hash=...`

Si erreur `chunk 0 failed after ... attempts`:
1. verifier que `T5` est toujours actif,
2. verifier `<NODE_ID_MACHINE_1>` correct,
3. verifier port provider `9931` correct,
4. relancer la commande `download`.

## 4.8 `trust <node_id>` (equivalent projet)

Le projet utilise:

```bash
node src/cli/archipel.mjs trust --node-id <node_id> --node-name machine-1
```

Routine complete:

1. approuver:

```bash
node src/cli/archipel.mjs trust --node-name machine-1 --approve <NODE_ID_MACHINE_2> --by machine-1
```

2. verifier cible:

```bash
node src/cli/archipel.mjs trust --node-name machine-1 --node-id <NODE_ID_MACHINE_2>
```

3. revoquer (optionnel):

```bash
node src/cli/archipel.mjs trust --node-name machine-1 --revoke <NODE_ID_MACHINE_2> --by machine-1 --reason "test"
```

## 5. Gemini (optionnel)

### 5.1 Requete directe

```bash
node src/cli/archipel.mjs ask --prompt "bonjour" --node-name machine-1
```

### 5.2 Mode offline strict

```bash
node src/cli/archipel.mjs ask --prompt "bonjour" --node-name machine-1 --no-ai
```

### 5.3 Triggers IA dans le chat

```bash
node src/cli/archipel.mjs msg <NODE_ID_MACHINE_2> "/ask resume les echanges" --node-name machine-1 --to-port 8802
node src/cli/archipel.mjs msg <NODE_ID_MACHINE_2> "@archipel-ai donne un recap" --node-name machine-1 --to-port 8802
```

## 6. Erreurs frequentes -> correction immediate

1. `peer table empty; run start and discovery first`
- start non lance ou discovery pas terminee
- solution: section 3 + attendre 30-60s

2. `node_id not found in peer table`
- mauvais node_id / prefixe ambigu
- solution: reprendre `status --node-name cible` et copier l'id complet

3. `error: chunk 0 failed after 8 attempts`
- provider absent/inactif/mauvais peer
- solution: verifier `receive --listen` + `--peer <nodeid>@host:port`

4. `ai disabled (use ARCHIPEL_AI_ENABLED=true...)`
- `.env` non charge ou `ARCHIPEL_AI_ENABLED=false`

5. `ai unavailable: HTTP 404`
- modele non disponible pour la cle
- essayer `gemini-2.0-flash`

6. `ai unavailable: HTTP 429`
- quota/rate limit Google
- attendre, reduire la frequence, verifier quota/facturation

## 7. Sequence de validation complete (copiable)

Dans l'ordre:

1. `start` sur 3 noeuds (`T1/T2/T3`)
2. verifier `peers` et `status` (`T6`)
3. `secure-listen` cible (`T4`)
4. `msg` depuis machine-1 (`T6`)
5. `send` fichier (`T6`)
6. `receive` liste fichiers (`T6`)
7. `receive --listen` provider (`T5`)
8. `download` depuis machine-2 (`T6`)
9. `trust --approve` puis `trust --node-id` (`T6`)
10. `ask` (ou `--no-ai`) (`T6`)

Si chaque etape donne le resultat attendu, tes commandes Sprint 4 sont valides.