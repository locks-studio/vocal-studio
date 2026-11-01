# Hush

Une fenêtre à côté de Discord qui affiche ton salon vocal avec une interface personnalisable : ambiances, dispositions (grille, orbite, scène), halos animés autour de ceux qui parlent, fond animé.

Elle passe par le **RPC local officiel de Discord** : elle lit le salon où tu es connecté, qui parle, qui est muet, et peut couper ton micro, te mettre en sourdine ou te faire quitter le salon. Le client Discord n'est pas modifié.

## 1. Créer ton application Discord (une seule fois)

1. Va sur <https://discord.com/developers/applications> et clique sur **New Application**. Nomme-la « Hush ».
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

Sous Windows, tu peux aussi double-cliquer sur `Lancer Hush.bat`.

Au premier lancement :

1. Colle le Client ID et le Client Secret, puis clique sur **Enregistrer et connecter**.
2. Discord ouvre une fenêtre qui demande d'autoriser Hush. Clique sur **Autoriser**.
3. Rejoins un salon vocal : il s'affiche tout seul.

Tes identifiants et ta connexion sont gardés sur ce PC, chiffrés par Windows (dans `%APPDATA%\Hush\config.json`, ou `%APPDATA%\vocal-studio\` si tu utilisais déjà l'appli avant son changement de nom). Les réglages visuels sont enregistrés automatiquement.

Sans configuration, le bouton **Mode démo** affiche un faux salon pour essayer les réglages.

## Les styles prêts à l'emploi

L'engrenage en haut à droite ouvre les **paramètres** au centre de l'écran, avec cinq onglets : **Général** (styles prêts, disposition, joueurs, caméra), **Style** (ambiance, couleurs, fond, avatars), **Son** (lecteur musique et sources), **Vidéo** (zoom, vitesse, plein écran, premier plan) et **Compte** (connexion Discord, mode démo). Échap, la croix ou un clic à côté les ferme. Les paramètres, la barre d'appel et les messages sont en style « verre liquide ». F11 ou l'icône à côté passe en plein écran, net jusqu'en 2K et au-delà.

- **Style de base · Espace** (par défaut) : fond noir étoilé avec des étoiles filantes, rangée d'avatars, anneau blanc lumineux autour de celui qui parle.

En mode **Bande** avec la caméra active, celui qui parle est **toujours au centre de l'image**, même tout au bout de la rangée et quel que soit l'angle : l'appli mesure à chaque image où il est affiché et corrige l'écart. La caméra glisse vers lui sans à-coup, la rangée est un plan 3D légèrement plongeant qui s'enfonce du côté où il reste le plus de monde. Quand plusieurs personnes parlent, la caméra centre le groupe et dézoome juste assez pour les voir en entier. Si quelqu'un qui n'était pas affiché (au-delà du nombre de joueurs choisi) se met à parler, il prend la place d'un membre silencieux.

**Fond Dégradé** : un fond sans motif, clair au centre et sombre sur les bords, dans la couleur d'accent. Le lecteur musique a aussi un réglage **Fond du lecteur** : Mosaïque ou Dégradé.
- **Style montage 2 · Bande** : pseudos en police pixel, la caméra file vers celui qui parle avec un zoom « punch », et le fond change à chaque prise de parole (damier étoilé, vagues, espace).

**Mes préréglages** (Paramètres › Général) : règle Hush comme tu aimes, donne un nom et **Enregistrer**. Un préréglage garde le look (disposition, anneau, couleurs, fond, flou, police, zoom). ▶ l'applique, ⟳ le remplace par les réglages actuels, ⇩ l'exporte en fichier `.hush` à partager ; « Importer un fichier .hush » le récupère.

**Profils** (Paramètres › Compte) : chaque profil garde *tous* ses réglages (look, lecteur, noms de salons, notes…). Crée par exemple « Stream » et « Potes » et passe de l'un à l'autre avec la liste.

**Flou du fond** (Paramètres › Style) : de 0 à 30 px, en 4 types : Doux, Mouvement (flou horizontal), Verre dépoli (flou + grain) et Profondeur (net au centre, flou en haut et en bas).

Quand tu modifies un réglage, les paramètres se rangent sur le côté : la scène et le lecteur se décalent pour rester centrés dans la partie encore visible.
- **Style montage 1 · Cinéma** : décrit ci-dessous.

Le réglage **Caméra qui suit celui qui parle** active ou coupe les mouvements de caméra (modes Cinéma 3D et Bande). Coupé, tout le salon reste cadré et seul celui qui parle grossit un peu.

**Piloter la caméra à la main** (modes Cinéma 3D et Bande) :

- **Clic-glisser** sur la scène : déplace la caméra (gauche/droite le long des joueurs, haut/bas).
- **Molette** : zoom avant ou arrière (de 60 % à 180 %), dans toutes les dispositions. Le zoom agrandit ou réduit les avatars eux-mêmes, donc rien n'est coupé. Il reste tel quel jusqu'à ce que tu le changes ; **Ctrl+0** le remet à 100 %. Aussi réglable dans Paramètres › Vidéo.
- **Ctrl+clic sur un joueur** : verrouille la caméra sur lui (badge « CAM »). Ctrl+clic à nouveau, ou sur le fond, pour la libérer.
- Sans action pendant **2,5 secondes**, la caméra repart toute seule sur celui qui parle (ou sur le joueur verrouillé).

## Le style « montage 1 » (Cinéma 3D)

Le bouton **Style montage 1 · Cinéma** active d'un coup :

- la disposition **Cinéma 3D** : les avatars flottent dans l'espace, la caméra pivote doucement et glisse vers celui qui parle ;
- l'ambiance **Halo vert** avec l'anneau **Plein lumineux** autour de celui qui parle ;
- le fond **Espace**. Avec **Image**, tu peux mettre ta propre image de fond ;
- le **lecteur musique** en bas à droite.

## Voix, caméra et anneau

- **Anneaux** (Paramètres › Style), tous animés selon le volume :
  - **Aura** (par défaut) : des fils lumineux emmêlés qui se tordent autour de l'avatar, avec des gouttes qui s'échappent quand on parle fort ;
  - **Vagues** : trois anneaux translucides qui ondulent ;
  - **Flammes** : une couronne de langues de feu et d'étincelles ;
  - **Énergie** : des contours électriques qui glissent les uns sur les autres ;
  - **Dégradé** et **Plein**.
- **Couleur de l'anneau** : d'origine (vert pour Aura et Vagues, bleu pour Flammes et Énergie), **Ma couleur**, ou **Pochette** (les couleurs de la pochette du morceau en cours).
- **Ignorer les voix trop faibles** (Paramètres › Général, mode bot) : sous ce volume, l'anneau ne s'allume pas et la caméra ne va pas sur la personne (souffle, bruit de fond).
- **Ombre portée** sous les avatars (désactivable dans Paramètres › Style).
- **Volume réel** : avec le bot, Hush connaît le volume (dB) de chaque voix. Les plus fortes sont affichées en priorité et la caméra se pose sur la plus forte.
- **Avatars GIF** : ils ne s'animent que quand la personne parle.
- **Caméra / live** des autres : un badge caméra ou « LIVE » apparaît sur leur avatar. Discord ne laisse aucune appli recevoir la vidéo d'un appel, donc leurs flux ne peuvent pas s'afficher.
- **Ta caméra et ton partage d'écran** (boutons de la barre d'appel) : ta caméra remplace ton avatar, ton écran s'affiche dans une fenêtre flottante (déplace-la par son bandeau, agrandis-la par son coin). C'est affiché **dans Hush** seulement : pour que le salon Discord te voie, allume-les aussi dans Discord.
- **Plusieurs personnes parlent** (mode Bande) : la caméra reste posée sur le groupe de ceux qui ont parlé ces dernières secondes et dézoome pour les cadrer. Si le groupe est trop étalé, elle garde les voix les plus fortes, et les autres apparaissent en **loupes** juste au-dessus de la barre d'appel.
- **Disposition Discord** : la grille de tuiles façon appel Discord, avec le contour vert quand on parle.

## Clic droit sur un membre

Un menu comme celui de Discord :

- **Profil, Envoyer un message, Commencer un appel, Ajouter en ami, Bloquer** : ouvrent son profil dans l'appli Discord (Discord ne laisse pas une appli faire ces actions à ta place).
- **Mentionner** : copie la mention, à coller dans un salon textuel. **Copier l'identifiant** aussi.
- **Ajouter une note** : une note visible seulement par toi (au survol de l'avatar).
- **Volume** : en connexion directe (RPC), c'est le vrai volume Discord de ce membre, pour toi seulement, et **Rendre muet (pour toi)** marche aussi. Avec le bot, c'est le **volume dans Hush** : il rend sa voix plus ou moins « forte » pour l'anneau et la caméra (utile pour un ami au micro faible).
- **Masquer dans Hush** : le retire de la scène (clic droit sur le fond pour tout réafficher).
- **Avec le bot** : Changer le pseudo, Rôles, Déplacer vers, Rendre muet / Mettre en sourdine sur le serveur, Déconnecter du vocal. Seulement si **toi** tu as la permission sur le serveur, et si le bot l'a aussi (réinvite-le avec le nouveau lien affiché au lancement du bot).

## Mini-fenêtre et clips

- **Mini-fenêtre** (icône à côté de l'épingle, ou Paramètres › Vidéo) : petite fenêtre aux coins arrondis, toujours au premier plan, qu'on déplace en la faisant glisser et qu'on redimensionne par ses bords. Au survol, le bouton ◎ la rend **transparente** : il ne reste que les avatars (parfait pour OBS ou par-dessus un jeu).
- **Clips** (bouton ⏺ de la barre d'appel, ou **F9**) : enregistre la fenêtre Hush en vidéo, avec le son du PC si tu veux (voix Discord, musique), dans `Vidéos\Hush`. 15 minutes au plus. Cliquer sur le message de fin ouvre le dossier.

## Raccourcis et petites commandes

- **Nom du salon** : clique sur le nom en haut à gauche pour le renommer (Entrée pour valider, Échap pour annuler, vide pour reprendre celui de Discord). Le nouveau nom ne s'affiche que dans Hush.
- **Espace** : pause / lecture de la musique.
- **F9** : démarrer / arrêter un clip.
- **Lecteur musique** : fais-le glisser pour le déplacer ; l'arc blanc en bas à droite (comme sur les widgets iPhone) l'agrandit ou le rapetisse. Double-clic sur la carte : retour en bas à droite ; double-clic sur l'arc : taille d'origine.
- **Interface masquée** : après 3 secondes sans bouger la souris, la barre du haut, la barre d'appel et le curseur disparaissent ; ils reviennent dès que tu bouges. Désactivable dans Paramètres › Général.

## Le lecteur musique

Il est toujours en bas à droite, dans toutes les dispositions, derrière les avatars : pochette, titre, onde sonore, vinyle qui tourne, temps écoulé et restant.

- **Pause, suivant, précédent** marchent pour toutes les sources : Mes sons, Ce PC (Deezer, navigateur…) et Compte Spotify (Spotify ne l'autorise qu'aux comptes Premium ; si tu avais connecté Spotify avant, reconnecte-le une fois pour donner l'autorisation).
- **Taille** : passe la souris sur le lecteur, attrape la poignée ronde en haut à gauche et fais-la glisser pour l'agrandir ou le réduire. Double-clic sur la poignée : taille d'origine.

**Couleur du lecteur** : la bordure et la mosaïque de fond prennent soit la couleur de la **pochette**, soit la **couleur d'accent** de l'ambiance.

Dans les paramètres, **Lecteur musique** propose quatre sources :

- **Mes sons** : importe tes propres fichiers (MP3, M4A, WAV, OGG, FLAC, MP4, WebM) avec **Ajouter des sons** ou le **+** du lecteur, ou **enregistre un son au micro** avec **Enregistrer au micro** (clique à nouveau pour arrêter). Dans la liste : clique sur un titre pour le renommer, 🖼 pour choisir sa pochette, ♪ pour ses paroles. Le titre, l'artiste et la pochette sont lus dans le fichier. Les boutons du lecteur (précédent, lecture/pause, suivant) et la barre de progression marchent. Les sons sont copiés dans l'appli : tu peux supprimer les originaux.
- **Ce PC** (par défaut) : lit ce que Windows sait de la musique en cours. Ça marche avec l'appli Deezer, Deezer dans le navigateur, Spotify, YouTube… Rien à connecter. Si plusieurs choses jouent, Deezer passe en premier. Si rien ne joue, la carte se cache.
- **Compte Spotify** : lit directement ton compte, même si la musique joue sur ton téléphone. Il faut une appli Spotify (une fois) :
  1. Va sur <https://developer.spotify.com/dashboard> et crée une appli (coche **Web API**).
  2. Dans **Redirect URIs**, ajoute exactement `http://127.0.0.1:43821/callback`.
  3. Copie le **Client ID** dans Hush, puis clique sur **Connecter Spotify** et accepte dans le navigateur.
- **À la main** : titre et pochette que tu choisis.

Deezer ne permet plus de créer d'applications développeur, c'est pour ça qu'il passe par « Ce PC ».

Quand la source ne donne pas d'image (certains navigateurs, comme Opera GX, envoient une miniature vide pour YouTube), l'appli cherche la pochette dans le catalogue public de Deezer à partir du titre et de l'artiste. Elle ne l'affiche que si l'artiste correspond, pour éviter une mauvaise pochette.

Les sons de **Mes sons** sont joués sur ton PC. Pour que tout le salon les entende, partage ton écran (ou la fenêtre Hush) avec le son dans Discord. La musique Spotify ou Deezer, elle, ne peut pas être rediffusée : pour écouter tous ensemble, utilise « Écouter ensemble » de Discord (Spotify).

## Le mode Paroles

Dans **Disposition**, choisis **Paroles** : un vinyle « radiographie » blanc lumineux tourne à gauche, et les paroles du morceau en cours apparaissent ligne par ligne à droite, synchronisées, avec des éclairs de lumière (sur les coups forts quand le son est joué dans l'appli).

- Les paroles sont cherchées automatiquement dans la base libre [LRCLIB](https://lrclib.net) à partir du titre et de l'artiste. Ça marche avec toutes les sources (Mes sons, Deezer, Spotify…).
- Pour un son importé, tu peux donner ton propre fichier de paroles `.lrc` : importe-le en même temps que le son (même nom de fichier), ou clique sur **♪** à côté du son dans la liste.
- Si aucune parole n'est trouvée, l'appli l'indique à la place du texte.

## Ce qu'il faut savoir

- **Qui peut l'utiliser ?** Discord réserve l'accès au salon vocal par RPC aux applications validées. Une application non validée marche pour son propriétaire (toi). Pour des amis, ajoute-les comme testeurs de l'application sur le portail développeur (**App Testers**), dans la limite fixée par Discord.
- **Caméra et partage d'écran** : Discord ne donne accès aux flux vidéo de personne. Hush affiche les avatars des autres, et seulement ta propre caméra / ton propre écran.
- **Réactions** (🔥😂💜👏) : elles ne sont visibles que dans ta fenêtre. Pratique si tu captures Hush dans OBS pour un stream.
- **Épingle** (dans la barre de titre) : garde la fenêtre au premier plan, par-dessus un jeu en mode fenêtré.

## Structure

| Fichier | Rôle |
| --- | --- |
| `src/rpc.js` | Connexion au tube local de Discord (`discord-ipc-0`) et échange des messages |
| `src/voice.js` | Autorisation, suivi du salon, des membres et de qui parle |
| `src/main.js` | Fenêtre Electron, stockage chiffré des identifiants |
| `src/preload.js` | Pont sécurisé entre la fenêtre et Discord |
| `renderer/` | L'interface (HTML, CSS, animations) |
| `renderer/rings.js` | Les anneaux dessinés (Aura, Vagues, Flammes, Énergie) |
| `renderer/usermenu.js` | Le menu clic droit sur un membre |
| `renderer/profiles.js` | Préréglages et profils |
| `renderer/capture.js` | Caméra, partage d'écran et clips |
