# 1999 — le launcher

Le launcher de Locks, façon Riot Client : on l'installe une fois, et il **installe, met à jour et lance** Hush (et les prochains logiciels). Il marche sur **Windows, Mac et Linux**.

Comment ça marche :

1. Sur ton site (Hostinger), un dossier `1999/` contient un fichier **`catalog.json`** (la liste des logiciels, leurs versions, et un lien par système) et les fichiers à télécharger.
2. Le launcher lit ce catalogue. S'il n'a pas le logiciel, le bouton dit **Installer** ; s'il a une ancienne version, **Mettre à jour** ; sinon **Lancer**.
3. Chaque fichier téléchargé est vérifié (empreinte SHA-256 du catalogue) avant d'être installé : un fichier abîmé ou modifié est refusé.
4. Les logiciels s'installent dans les données de l'utilisateur (pas besoin d'être administrateur). Désinstaller garde les réglages.
5. Hors ligne, le launcher lance quand même ce qui est installé.

## 1. Choisir l'adresse du site (une seule fois)

Remplace `TON-DOMAINE.fr` par ton vrai domaine dans **deux** fichiers (la même adresse) :

- `config.json` → `catalogUrl` : `https://ton-domaine.fr/1999/catalog.json`
- `publish.json` → `baseUrl` : `https://ton-domaine.fr/1999` (et `launcher.page`)

Puis refabrique le launcher (étape 2) : l'adresse est gravée dedans.

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

**Mac et Linux** : impossible de les fabriquer depuis Windows (Apple l'interdit pour Mac). Le fichier `.github/workflows/build.yml` le fait pour toi sur GitHub, gratuitement :

1. Mets le dossier `Vocal Studio` sur GitHub (dépôt privé possible).
2. Onglet **Actions** › **Construire** › **Run workflow**.
3. Quand c'est fini, télécharge les « Artifacts » et range les fichiers dans `vocal-studio-app/dist/` et `launcher/dist/`.

Il construit aussi Windows : tu peux tout faire par là.

## 3. Publier sur Hostinger

```bash
cd launcher
node tools/make-catalog.js
```

Ça prépare `launcher/site/1999/` : les fichiers, le `catalog.json` avec les empreintes, l'icône, et une **page de téléchargement** (`index.html`) avec un bouton par système.

Envoie **tout le contenu** de `site/1999/` dans `public_html/1999/` sur Hostinger (Gestionnaire de fichiers, ou FTP avec FileZilla). Un système dont le fichier manque (par exemple Mac pas encore construit) est simplement sauté : le launcher y affichera « Bientôt ».

Pour une nouvelle version de Hush : augmente `version` dans `vocal-studio-app/package.json`, change les `notes` dans `publish.json`, refabrique, relance `make-catalog.js` et renvoie le dossier. Les launchers de tes amis proposeront **Mettre à jour** (ils relisent le catalogue toutes les 10 minutes et à chaque ouverture).

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
