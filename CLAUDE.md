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

## Suivi à deux (pour nos deux Claude)

Le suivi se fait **sur GitHub**, pour que le Claude de Locks et celui de Gabinoul sachent toujours ce que l'autre fait, et ne modifient pas les mêmes fichiers en même temps.

- **Les tâches = les issues GitHub.** Une issue par tâche, **assignée à celui qui la fait**, avec une étiquette d'état (`à faire`, `en cours`, `bloqué`) et de partie (`hush`, `launcher`, `bot`, `hush-studio`). Le modèle « Tâche » demande les fichiers qui vont bouger et la branche.
- **Le tableau de bord** : `node tools/suivi.js` affiche les tâches, les Pull Requests (et celles à relire), les branches de l'autre et **les fichiers qu'il est en train de modifier**. Il se lance tout seul au début de chaque session Claude Code (hook dans `.claude/settings.json`).

### Avant de commencer une tâche
1. `git pull` sur `main`, puis lire le tableau de bord (`node tools/suivi.js`).
2. Si un fichier à modifier est **en cours de modification par l'autre** : ne pas y toucher. Lui demander d'abord, en commentaire sur son issue ou sa Pull Request.
3. Trouver l'issue de la tâche, ou la créer, puis se l'assigner :
   ```bash
   gh issue create --title "…" --label "à faire,hush" --body "Fichiers : …"
   gh issue edit <n> --add-assignee @me --add-label "en cours" --remove-label "à faire"
   ```
4. Créer la branche depuis `main` à jour : `git checkout -b <nom-court>`.

### Pendant
- **Petits commits envoyés souvent** (`git push`) : c'est ce qui permet au tableau de bord de l'autre de voir les fichiers touchés.
- À chaque étape importante, un mot sur l'issue : `gh issue comment <n> --body "Fait : … · Reste : …"`.
- Si `main` a bougé : `git merge origin/main` sur sa branche, et régler les conflits tout de suite.
- Bloqué ? Étiquette `bloqué` et un commentaire qui dit pourquoi.

### À la fin
- Pull Request vers `main` avec « Ferme #<n> » dans la description (le modèle le prévoit), puis relecture : `gh pr edit <n> --add-reviewer <l'autre>`.
- L'autre relit avec `gh pr diff <n>` puis `gh pr review <n> --approve` (ou `--request-changes -b "…"`). La fusion ferme l'issue toute seule.

Pseudos GitHub : Locks = `lrtdetrox-byte`, Gabinoul = `Gabinou22s`.

Pour Claude : suivre ces règles. Au début d'une session, tenir compte du tableau de bord affiché par le hook (ou lancer `node tools/suivi.js`). Avant de modifier du code : vérifier qu'une issue existe et est assignée à la personne avec qui tu travailles, créer une branche, et ne jamais toucher aux fichiers que l'autre est en train de modifier sans accord. Mettre l'issue à jour au fil du travail. Ne jamais pousser sur `main`, et ne commiter ou ouvrir une Pull Request que quand on le demande.
