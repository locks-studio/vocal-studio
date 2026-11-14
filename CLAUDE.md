# Vocal Studio : Hush, le launcher 1999 et le bot

Projet de Locks, développé à deux avec Gabinoul. Tout est en **français** : le code commenté, les textes de l'interface et les messages de commit.

## Ce que contient le dépôt

| Dossier | Ce que c'est |
|---|---|
| `vocal-studio-app/` | **Hush** : appli Electron 33 (JS natif) qui rend les vocaux Discord visuels (avatars, anneaux, caméra, overlay en jeu, tchat, amis). |
| `launcher/` | **1999** : le launcher qui installe, met à jour et lance Hush sur Windows, Mac et Linux. Contient aussi le site (`launcher/website/`) et les outils de publication. |
| `vocal-studio-bot/` | **Le bot Discord « 1999 »** et son serveur : il rejoint les vocaux, mesure qui parle, gère les comptes, les amis, le tchat. |
| `tools/` | Contrôles automatiques (`check.js`), test de démarrage (`smoke.js`), signature et tests Mac. |
| `.github/workflows/` | `check.yml` (contrôles à chaque envoi), `mac.yml` (construit et teste les versions Mac sur un Mac de GitHub). |
| `docs/` | Guides (test avec des amis, règles Discord). |

## Installer

Il faut **Node.js 20** et **git**. Dans chaque partie dont tu as besoin :

```bash
cd vocal-studio-app && npm ci
cd launcher && npm ci
cd vocal-studio-bot && npm ci
```

## Lancer

- **Hush** : `cd vocal-studio-app && npm start` (sans bot, le « Mode démo » affiche un salon fictif).
- **Le launcher** : `cd launcher && npm start`.
- **Le bot** : copier `vocal-studio-bot/.env.example` en `vocal-studio-bot/.env`, le remplir (token Discord, etc.), puis `cd vocal-studio-bot && npm start`. Le bot tourne d'habitude sur le PC de Locks : ne lancez pas un deuxième bot avec le même token.

## Tester

- **Avant chaque commit** : `node tools/check.js` à la racine. Tout doit être « Contrôles OK ».
- **Démarrage réel des applis** : `node tools/check.js --smoke` (lance Hush et le launcher et vérifie qu'ils démarrent sans erreur).
- **Interface** : lancer Hush, passer en Mode démo, et vérifier à l'œil ce qu'on a changé.
- Les mêmes contrôles tournent automatiquement sur GitHub à chaque envoi (onglet Actions).

## Publier une version (Locks)

1. Monter la version dans `vocal-studio-app/package.json` (et `launcher/package.json` si le launcher change), écrire les nouveautés dans `launcher/publish.json`.
2. Construire Windows et Linux en local (`npm run dist:win`, `npm run dist:linux`), et Mac sur GitHub : `gh workflow run mac.yml --ref <branche> -f runner=macos-latest` (si aucun Mac n'est libre : `-f runner=macos-15-intel`). Récupérer les fichiers avec `gh run download`.
3. `cd launcher && node tools/make-catalog.js`, puis `npm run publier` (envoi FTP, catalogue en dernier, vérification en ligne).
Les launchers installent ensuite la nouvelle version tout seuls.

## Règles importantes

- **Jamais de secret dans git** : `.env`, `launcher/ftp.env`, tokens Discord, mots de passe, `sessions.json`, `friends.json`, `usage.json`, `reports.json` sont ignorés par git et doivent le rester. On ne les lit pas, on ne les affiche pas, on ne les colle pas dans une discussion.
- `vocal-studio-app/renderer/i18n.js` et `launcher/renderer/i18n.js` doivent rester **identiques** (le contrôle le vérifie). Tout nouveau texte de l'interface a sa traduction anglaise dans `i18n.js`.
- Ne pas publier d'informations privées des membres.

## Travailler à deux

1. **`git pull` avant de commencer** à travailler, à chaque fois.
2. **On ne travaille jamais directement sur `main`.** `main` = ce qui est publié et qui marche.
3. **Une branche par fonctionnalité**, partie de `main` à jour :
   ```bash
   git checkout main
   git pull
   git checkout -b nom-de-la-fonctionnalite
   ```
4. On commite sur sa branche, on l'envoie (`git push -u origin nom-de-la-fonctionnalite`), puis on ouvre une **Pull Request** vers `main` (`gh pr create`).
5. **L'autre relit la Pull Request** avant qu'elle soit fusionnée. Personne ne fusionne sa propre Pull Request sans relecture.
6. Après la fusion, on revient sur `main`, on fait `git pull`, et on supprime la branche terminée.

Pour Claude : suivre ces règles. Créer une branche avant de modifier quoi que ce soit, ne jamais pousser sur `main`, et ne commiter ou ouvrir une Pull Request que quand on le demande.
