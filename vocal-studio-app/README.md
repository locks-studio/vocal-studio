# Vocal Studio

Une fenêtre à côté de Discord qui affiche ton salon vocal avec une interface personnalisable : ambiances, dispositions (grille, orbite, scène), halos animés autour de ceux qui parlent, fond animé.

Elle passe par le **RPC local officiel de Discord** : elle lit le salon où tu es connecté, qui parle, qui est muet, et peut couper ton micro, te mettre en sourdine ou te faire quitter le salon. Le client Discord n'est pas modifié.

## 1. Créer ton application Discord (une seule fois)

1. Va sur <https://discord.com/developers/applications> et clique sur **New Application**. Nomme-la « Vocal Studio ».
2. Dans **OAuth2** :
   - copie le **Client ID** ;
   - clique sur **Reset Secret** et copie le **Client Secret** (garde-le pour toi) ;
   - dans **Redirects**, ajoute `http://localhost` puis clique sur **Save Changes**.

## 2. Lancer l'appli

Il faut [Node.js](https://nodejs.org) (version 18 ou plus) et Discord ouvert sur le PC.

```bash
npm install
npm start
```

Sous Windows, tu peux aussi double-cliquer sur `Lancer Vocal Studio.bat`.

Au premier lancement :

1. Colle le Client ID et le Client Secret, puis clique sur **Enregistrer et connecter**.
2. Discord ouvre une fenêtre qui demande d'autoriser Vocal Studio. Clique sur **Autoriser**.
3. Rejoins un salon vocal : il s'affiche tout seul.

Tes identifiants et ta connexion sont gardés sur ce PC, chiffrés par Windows (dans `%APPDATA%\vocal-studio\config.json`). Les réglages visuels sont enregistrés automatiquement.

Sans configuration, le bouton **Mode démo** affiche un faux salon pour essayer les réglages.

## Les styles prêts à l'emploi

L'engrenage en haut à droite ouvre les paramètres (Échap les ferme). F11 ou l'icône à côté passe en plein écran, net jusqu'en 2K et au-delà.

- **Style de base · Espace** (par défaut) : fond noir étoilé avec des étoiles filantes, rangée d'avatars, anneau blanc lumineux autour de celui qui parle.
- **Style montage 2 · Bande** : pseudos en police pixel, la caméra file vers celui qui parle avec un zoom « punch », et le fond change à chaque prise de parole (damier étoilé, vagues, grille néon).
- **Style montage 1 · Cinéma** : décrit ci-dessous.

Le réglage **Caméra qui suit celui qui parle** active ou coupe les mouvements de caméra (modes Cinéma 3D et Bande). Coupé, tout le salon reste cadré et seul celui qui parle grossit un peu.

## Le style « montage 1 » (Cinéma 3D)

Le bouton **Style montage 1 · Cinéma** active d'un coup :

- la disposition **Cinéma 3D** : les avatars flottent dans l'espace, la caméra pivote doucement et glisse vers celui qui parle ;
- l'ambiance **Halo vert** avec l'anneau **Plein lumineux** autour de celui qui parle ;
- le fond **Vignette** (sombre teinté de rouge). Avec **Image**, tu peux mettre ta propre image de fond ;
- le **lecteur musique** en bas à droite.

## Le lecteur musique

Il est toujours en bas à droite, dans toutes les dispositions : pochette, titre, onde sonore, vinyle qui tourne, temps écoulé et restant. Sa couleur et sa mosaïque de fond suivent la couleur de la pochette.

Dans les paramètres, **Lecteur musique** propose quatre sources :

- **Mes sons** : importe tes propres fichiers (MP3, M4A, WAV, OGG, FLAC) avec **Ajouter des sons** ou le **+** du lecteur. Le titre, l'artiste et la pochette sont lus dans le fichier. Les boutons du lecteur (précédent, lecture/pause, suivant) et la barre de progression marchent. Les sons sont copiés dans l'appli : tu peux supprimer les originaux.
- **Ce PC** (par défaut) : lit ce que Windows sait de la musique en cours. Ça marche avec l'appli Deezer, Deezer dans le navigateur, Spotify, YouTube… Rien à connecter. Si plusieurs choses jouent, Deezer passe en premier. Si rien ne joue, la carte se cache.
- **Compte Spotify** : lit directement ton compte, même si la musique joue sur ton téléphone. Il faut une appli Spotify (une fois) :
  1. Va sur <https://developer.spotify.com/dashboard> et crée une appli (coche **Web API**).
  2. Dans **Redirect URIs**, ajoute exactement `http://127.0.0.1:43821/callback`.
  3. Copie le **Client ID** dans Vocal Studio, puis clique sur **Connecter Spotify** et accepte dans le navigateur.
- **À la main** : titre et pochette que tu choisis.

Deezer ne permet plus de créer d'applications développeur, c'est pour ça qu'il passe par « Ce PC ».

Les sons de **Mes sons** sont joués sur ton PC. Pour que tout le salon les entende, partage ton écran (ou la fenêtre Vocal Studio) avec le son dans Discord. La musique Spotify ou Deezer, elle, ne peut pas être rediffusée : pour écouter tous ensemble, utilise « Écouter ensemble » de Discord (Spotify).

## Le mode Paroles

Dans **Disposition**, choisis **Paroles** : un vinyle « radiographie » blanc lumineux tourne à gauche, et les paroles du morceau en cours apparaissent ligne par ligne à droite, synchronisées, avec des éclairs de lumière (sur les coups forts quand le son est joué dans l'appli).

- Les paroles sont cherchées automatiquement dans la base libre [LRCLIB](https://lrclib.net) à partir du titre et de l'artiste. Ça marche avec toutes les sources (Mes sons, Deezer, Spotify…).
- Pour un son importé, tu peux donner ton propre fichier de paroles `.lrc` : importe-le en même temps que le son (même nom de fichier), ou clique sur **♪** à côté du son dans la liste.
- Si aucune parole n'est trouvée, l'appli l'indique à la place du texte.

## Ce qu'il faut savoir

- **Qui peut l'utiliser ?** Discord réserve l'accès au salon vocal par RPC aux applications validées. Une application non validée marche pour son propriétaire (toi). Pour des amis, ajoute-les comme testeurs de l'application sur le portail développeur (**App Testers**), dans la limite fixée par Discord.
- **Caméra et partage d'écran** : le RPC de Discord ne donne pas accès aux flux vidéo. Vocal Studio affiche donc les avatars, pas les vidéos.
- **Réactions** (🔥😂💜👏) : elles ne sont visibles que dans ta fenêtre. Pratique si tu captures Vocal Studio dans OBS pour un stream.
- **Épingle** (dans la barre de titre) : garde la fenêtre au premier plan, par-dessus un jeu en mode fenêtré.

## Structure

| Fichier | Rôle |
| --- | --- |
| `src/rpc.js` | Connexion au tube local de Discord (`discord-ipc-0`) et échange des messages |
| `src/voice.js` | Autorisation, suivi du salon, des membres et de qui parle |
| `src/main.js` | Fenêtre Electron, stockage chiffré des identifiants |
| `src/preload.js` | Pont sécurisé entre la fenêtre et Discord |
| `renderer/` | L'interface (HTML, CSS, animations) |
