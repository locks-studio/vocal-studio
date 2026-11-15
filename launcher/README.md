# 1999 — le launcher

Le launcher de Locks, façon Riot Client : on l'installe une fois, et il **installe, met à jour et lance** Hush (et les prochains logiciels). Il marche sur **Windows, Mac et Linux**.

Comment ça marche :

1. Sur ton site (Hostinger), un dossier `1999/` contient un fichier **`catalog.json`** (la liste des logiciels, leurs versions, et un lien par système) et les fichiers à télécharger.
2. Le launcher lit ce catalogue. S'il n'a pas le logiciel, le bouton dit **Installer** ; s'il a une ancienne version, **Mettre à jour** ; sinon **Lancer**.
3. Chaque fichier téléchargé est vérifié (empreinte SHA-256 du catalogue) avant d'être installé : un fichier abîmé ou modifié est refusé.
4. Les logiciels s'installent dans les données de l'utilisateur (pas besoin d'être administrateur). Désinstaller garde les réglages.
5. Hors ligne, le launcher lance quand même ce qui est installé.

## 1. L'adresse du site

C'est le sous-domaine **`1999.organisationphantom.fr`** : il a son propre dossier sur Hostinger, à part du site de la Phantom (que ses déploiements GitHub ne touchent donc jamais). Elle est écrite à deux endroits :

- `config.json` → `catalogUrl` : `https://1999.organisationphantom.fr/catalog.json` (gravée dans le launcher quand on le fabrique)
- `publish.json` → `baseUrl` et `launcher.page` : `https://1999.organisationphantom.fr`

Pour changer d'adresse plus tard : modifie ces deux fichiers, puis refabrique le launcher.

## 2. Fabriquer les fichiers

**Windows (sur ton PC)** :

```bash
cd vocal-studio-app
npm run dist:win
cd ../launcher
npm run dist:win
```

- Hush → `vocal-studio-app/dist/Hush-<version>-win-x64.zip`
- Launcher → `launcher/dist/1999-Setup-<version>-win-x64.exe` (installeur)

**Linux depuis Windows** (sans GitHub) : télécharge dans ton navigateur le moteur officiel `https://github.com/electron/electron/releases/download/v33.4.11/electron-v33.4.11-linux-x64.zip`, décompresse-le dans un dossier, puis :

```bash
cd vocal-studio-app
npx electron-builder --linux zip --x64 -c.electronDist=CHEMIN/DU/DOSSIER
cd ../launcher
npx electron-builder --linux dir --x64 -c.electronDist=CHEMIN/DU/DOSSIER
python tools/pack-linux.py
```

`pack-linux.py` emballe le launcher en `.tar.gz` en gardant les droits « exécutable » (un zip fait sous Windows les perdrait). Pour Hush, c'est le launcher qui remet ces droits à l'installation.

**Mac (et Linux proprement)** : impossible de fabriquer Mac depuis Windows (Apple l'interdit pour Mac). Le fichier `.github/workflows/build.yml` le fait pour toi sur GitHub, gratuitement :

1. Mets le dossier `Vocal Studio` sur GitHub (dépôt privé possible).
2. Onglet **Actions** › **Construire** › **Run workflow**.
3. Quand c'est fini, télécharge les « Artifacts » et range les fichiers dans `vocal-studio-app/dist/` et `launcher/dist/`.

Il construit aussi Windows : tu peux tout faire par là.

## 3. Publier sur Hostinger

```bash
cd launcher
node tools/make-catalog.js
```

Ça prépare `launcher/site/1999/` : le `catalog.json` avec les empreintes, l'icône, et une **page de téléchargement** (`index.html`) avec un bouton par système. Un système dont le fichier manque (par exemple Mac pas encore construit) est simplement sauté : le launcher y affichera « Bientôt ».

**Les gros fichiers passent par GitHub.** Hush et les installeurs / mises à jour du launcher se téléchargent depuis les Releases du dépôt `publish.json` › `github.repo` (aujourd'hui `locks-studio/vocal-studio`) : une release par version (`hush-v0.5.2`, `launcher-v0.5.1`, `test-hush-v…` pour le canal de test). `make-catalog.js` les range dans `site/github/`, et le catalogue pointe vers GitHub. Hostinger ne garde que le catalogue et le site.

- Ce dépôt doit être **public** : sinon les launchers reçoivent une erreur 404. Si le dépôt du code ne peut pas être public, crée un dépôt à part pour les releases et mets son nom dans `github.repo`.
- Il faut `gh` (GitHub CLI) connecté à un compte qui peut écrire dans ce dépôt : `gh auth login`.
- Pour revenir à l'ancien fonctionnement (tout sur Hostinger), retire `github` de `publish.json`.

Puis publie :

```bash
npm run publier
```

Ça envoie d'abord les fichiers sur GitHub (seulement ceux qui manquent), vérifie que chaque lien marche sans compte, puis envoie le site et le catalogue en dernier par FTP. `node tools/publish-github.js --essai` montre ce qui partirait sur GitHub, sans rien envoyer.

Pour une nouvelle version de Hush : augmente `version` dans `vocal-studio-app/package.json`, change les `notes` dans `publish.json`, refabrique, relance `make-catalog.js` puis `npm run publier`. Les launchers de tes amis proposeront **Mettre à jour** (ils relisent le catalogue toutes les 10 minutes et à chaque ouverture).

Pour une nouvelle version du launcher : même chose avec `launcher/package.json` ; le launcher affiche alors un lien vers la page de téléchargement.

## 4. Ajouter un autre logiciel

Ajoute une entrée dans `apps` de `publish.json` (id, nom, couleur, icône, notes, et les fichiers zip par système avec le nom du programme à lancer : `.exe` sur Windows, `.app` sur Mac, l'exécutable sur Linux). Il apparaît dans la colonne de gauche du launcher.

## Ce que ton ami verra

- **Windows** : « Windows a protégé votre ordinateur » au premier lancement de l'installeur → *Informations complémentaires* › *Exécuter quand même*. C'est normal pour un logiciel qui n'est pas signé (un certificat de signature coûte environ 100 à 300 €/an).
- **Mac** : « développeur non identifié » → clic droit sur l'app › *Ouvrir* (ou Réglages Système › Confidentialité et sécurité › *Ouvrir quand même*). Pour éviter ça, il faut un compte Apple Developer (99 $/an).
- **Linux** : rendre l'AppImage exécutable (clic droit › Propriétés › Autoriser l'exécution), puis double-clic.

## Tester sans rien mettre en ligne

```bash
cd launcher
node tools/make-catalog.js --base=file:///C:/Users/.../Vocal%20Studio/launcher/site/1999
npx electron . --catalog=file:///C:/Users/.../Vocal%20Studio/launcher/site/1999/catalog.json
```

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `src/main.js` | Fenêtre, lecture du catalogue (avec copie hors ligne) |
| `src/installer.js` | Téléchargement, vérification SHA-256, installation, lancement, désinstallation |
| `renderer/` | L'interface |
| `config.json` | Adresse du catalogue |
| `publish.json` | Ce qui est publié : logiciels, notes, fichiers par système |
| `tools/make-catalog.js` | Prépare le dossier à envoyer sur le site |
| `tools/publish-github.js` | Envoie les gros fichiers sur les Releases GitHub (lancé par `npm run publier`) |
