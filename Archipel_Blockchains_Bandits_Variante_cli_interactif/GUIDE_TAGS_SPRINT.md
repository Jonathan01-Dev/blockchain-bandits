# Guide Tags Sprint (Git)

Le projet n'est pas encore initialise en Git dans ce dossier. Pour creer les tags de sprint demandes par le hackathon:

## 1) Initialiser Git et premier commit
```bash
cd /home/daniel/Bureau/archipel
git init
git add .
git commit -m "chore: bootstrap archipel prototype"
```

## 2) Creer les tags de jalons
Adapte ces tags a vos vrais jalons commits:
```bash
git tag sprint-0
git tag sprint-1
git tag sprint-2
git tag sprint-3
git tag sprint-4
git tag final-submission
```

## 3) Verifier
```bash
git tag --list
```

## 4) Push vers GitHub
```bash
git remote add origin <URL_REPO>
git branch -M main
git push -u origin main
git push origin --tags
```

## Recommandation pratique
- Creez les tags sprint au bon moment (apres chaque jalon valide).
- Evitez de tagger tous les sprints sur un seul commit final si vous pouvez encore separer l'historique.
