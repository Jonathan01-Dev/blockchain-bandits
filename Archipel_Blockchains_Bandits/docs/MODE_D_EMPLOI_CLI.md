# Mode d'emploi CLI - Sprint 4 (Archipel)

Ce guide donne une routine de test complete, commande par commande, pour valider les fonctionnalites du Sprint 4 en terminal.

## 1. Preparation (obligatoire)

### 1.1 Installer les dependances

```bash
npm install
```

### 1.2 Generer les cles des noeuds

```bash
node src/crypto/generate-keys.mjs --node-name machine-1 --force
node src/crypto/generate-keys.mjs --node-name machine-2 --force
node src/crypto/generate-keys.mjs --node-name machine-3 --force
```

### 1.3 Configurer et charger `.env`

Exemple minimal:

```env
ARCHIPEL_DISCOVERY_HMAC_KEY=change-me-in-lan
ARCHIPEL_AI_ENABLED=true
ARCHIPEL_GEMINI_API_KEY=<ta_cle>
ARCHIPEL_GEMINI_MODEL=gemini-2.0-flash
```

PowerShell (chargement `.env` dans le terminal courant):

```powershell
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
  $name, $value = $_ -split '=', 2
  [System.Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), "Process")
}
```

Verification rapide:

```powershell
echo $env:ARCHIPEL_AI_ENABLED
echo $env:ARCHIPEL_GEMINI_MODEL
echo ($env:ARCHIPEL_GEMINI_API_KEY.Length)
```

## 2. Lancer le reseau local (3 noeuds)

Ouvrir 3 terminaux.

Terminal A:

```bash
node src/cli/archipel.mjs start --node-name machine-1 --port 7777
```

Terminal B:

```bash
node src/cli/archipel.mjs start --node-name machine-2 --port 7778
```

Terminal C:

```bash
node src/cli/archipel.mjs start --node-name machine-3 --port 7779
```

Attendre 30 a 60 secondes pour la discovery.

## 3. Routine de test par commande Sprint 4

## 3.1 `start --port`

Commande (deja lancee ci-dessus):

```bash
node src/cli/archipel.mjs start --node-name machine-1 --port 7777
```

Attendu:

- logs `HELLO` periodiques
- `tcp server listening ...`

## 3.2 `peers`

```bash
node src/cli/archipel.mjs peers --node-name machine-1
```

Attendu:

- `peers=2`
- 2 lignes de pairs (machine-2 et machine-3)

## 3.3 `status`

```bash
node src/cli/archipel.mjs status --node-name machine-1
```

Attendu:

- `node_id=...`
- `peers=...`
- `trusted_keys=...`
- `manifests=...`

## 3.4 `msg <node_id> "Hello!"`

### Etape 1: listener secure sur la cible

Terminal D:

```bash
node src/cli/archipel.mjs secure-listen --node-name machine-2 --port 8802
```

### Etape 2: recuperer l'ID cible

```bash
node src/cli/archipel.mjs status --node-name machine-2
```

Copier `node_id` de machine-2.

### Etape 3: envoyer un message chiffre

```bash
node src/cli/archipel.mjs msg <NODE_ID_MACHINE_2> "Hello!"
```

Attendu:

- `secure-send ok ...`
- message visible dans le terminal du `secure-listen`

## 3.5 `send <node_id> <filepath>`

Exemple:

```bash
node src/cli/archipel.mjs send <NODE_ID_MACHINE_2> .archipel/sprint4-check/sample.bin --node-name machine-1 --to-port 8802
```

Attendu:

- `file_id=...`
- `manifest_path=...`
- `file offer sent ...`

## 3.6 `receive`

```bash
node src/cli/archipel.mjs receive --node-name machine-1
```

Attendu:

- `available_files=...`
- liste des `file_id`

## 3.7 `download <file_id>`

### Etape 1: exposer les chunks du seed

Terminal E:

```bash
node src/cli/archipel.mjs receive --listen --node-name machine-1 --port 9931
```

### Etape 2: telecharger depuis un autre noeud

```bash
node src/cli/archipel.mjs download <FILE_ID> --node-name machine-2 --peer <NODE_ID_MACHINE_1>@127.0.0.1:9931
```

Attendu:

- `download ok file_id=...`
- `output_path=...`
- `file_hash=...`

## 3.8 `trust <node_id>` (equivalent projet)

Dans ce projet, l'equivalent est `trust --node-id <node_id>`.

### Approuver un pair

```bash
node src/cli/archipel.mjs trust --node-name machine-1 --approve <NODE_ID_MACHINE_2> --by machine-1
```

### Lister trust filtre sur un node_id

```bash
node src/cli/archipel.mjs trust --node-name machine-1 --node-id <NODE_ID_MACHINE_2>
```

Attendu:

- entree trust avec `mode` et `score`

## 4. Gemini (optionnel)

### Requete directe

```bash
node src/cli/archipel.mjs ask --prompt "bonjour"
```

### Mode offline strict

```bash
node src/cli/archipel.mjs ask --prompt "bonjour" --no-ai
```

### Triggers IA dans le chat

```bash
node src/cli/archipel.mjs msg <NODE_ID_MACHINE_2> "/ask resume les echanges"
node src/cli/archipel.mjs msg <NODE_ID_MACHINE_2> "@archipel-ai donne un recap"
```

## 5. Erreurs frequentes et correction

1. `ai disabled (use ARCHIPEL_AI_ENABLED=true ...)`
- `ARCHIPEL_AI_ENABLED` n'est pas `true` ou `--no-ai` est actif

2. `ai unavailable: HTTP 404`
- modele invalide/non disponible pour ta cle
- essayer `ARCHIPEL_GEMINI_MODEL=gemini-2.0-flash`

3. `ai unavailable: HTTP 429`
- quota/rate limit Gemini
- attendre, reduire la frequence, verifier quota/facturation

4. `peer table empty`
- les noeuds `start` ne tournent pas encore
- attendre la discovery

5. `at least one provider is required`
- aucun provider actif pour download
- lancer `receive --listen` et/ou passer `--peer`

## 6. Resume ultra-court (ordre conseille)

1. `start` sur 3 noeuds
2. `peers` + `status`
3. `secure-listen` puis `msg`
4. `send` puis `receive`
5. `receive --listen` puis `download`
6. `trust --approve` puis `trust --node-id`
7. `ask` (ou `--no-ai`)