# Suivi de la version Linux (Gabinoul)

Gabinoul s'occupe de la version Linux de Hush. Ce fichier dit ce qui a été changé, pourquoi, et ce qui reste à faire.
À lire avant de toucher à l'overlay sous Linux.

Machine de test : CachyOS, **niri 26.04 (Wayland)**, 3 écrans (eDP-1, HDMI-A-2, DP-1), `focus-follows-mouse` activé, Node 26.

## 1. Overlay sur la couche « overlay » du bureau (layer-shell)

**Problème.** Sous niri, une fenêtre en plein écran qui a le focus passe devant toutes les fenêtres flottantes
(c'est voulu par niri, voir sa doc « Fullscreen and Maximize »). L'overlay, une fenêtre Electron flottante, disparaissait
donc derrière un jeu ou une vidéo en plein écran. Aucune règle niri ne permet de le garder devant.
Seule la couche **overlay** de layer-shell (celle des notifications) passe devant le plein écran, et Electron ne sait pas y aller.

**Solution.**
- `vocal-studio-app/src/layer-overlay.py` (nouveau) : petit programme Python (GTK 3 + gtk-layer-shell) qui affiche une surface
  sur la couche overlay, la souris passe à travers, jamais le clavier. Il reçoit les images de Hush sur son entrée standard.
- `vocal-studio-app/src/layer-overlay.js` (nouveau) : vérifie une fois si c'est possible (`layerSupported()` : Linux, Wayland,
  `python3`, GTK 3, gtk-layer-shell, bureau compatible), lance le programme et lui envoie réglages et images.
- `vocal-studio-app/src/main.js` : `toggleMini()` appelle `openLayerMini()` quand c'est possible. La mini-fenêtre devient
  une `BrowserWindow` **hors écran** (`offscreen: true`, 30 images/s) ; chaque évènement `paint` part vers le programme.
  Sinon (X11, Windows, Mac, ou paquets absents), **l'ancienne mini-fenêtre reste utilisée, rien ne change**.
- `package.json` : `src/layer-overlay.py` ajouté à `asarUnpack` (Python ne lit pas dans `app.asar`).

Protocole sur l'entrée standard : 1 octet de type, 4 octets de longueur (petit-boutiste), puis le contenu.
`J` = réglages JSON `{ x, y, w, h, screen: { x, y }, edit }` ; `F` = image (largeur, hauteur, pixels BGRA prémultipliés,
c'est ce que donne `NativeImage.toBitmap()` d'Electron). Le programme répond sur sa sortie standard (une ligne JSON).

Mesuré : environ 0,4 % de processeur et 60 Mo de mémoire. Pas besoin de `NiriSticky` dans ce mode : la couche overlay
est sur tous les bureaux de son écran.

**Pour les utilisateurs Linux** : il faut `python3`, `python-gobject`, `gtk3` et `gtk-layer-shell`
(Arch : `python-gobject gtk3 gtk-layer-shell` ; Debian/Ubuntu : `python3-gi gir1.2-gtklayershell-0.1`). À écrire dans le
README et sur le site.

## 2. Mode « Déplacer » (souris et molette)

La souris traverse l'overlay, donc on ne pouvait plus le déplacer à la main. Nouveau bouton **Déplacer** dans
Paramètres › Overlay (visible quand l'overlay est ouvert, `#ovEdit` dans `index.html`).
- Pendant le réglage, `layer-overlay.py` met un **voile transparent sur chaque écran** (une surface layer-shell par écran,
  ancrée aux 4 bords). On fait glisser l'overlay, **même vers un autre écran** ; la molette change sa taille (5 % par cran,
  un cran à la fois, proportions gardées) ; Échap, clic droit ou « Terminé » pour finir.
- Les voiles ne bougent pas pendant le glisser : c'est ce qui rend le suivi de la souris exact. Une première version
  déplaçait la surface elle-même et la sensibilité était absurde (les positions reçues étaient relatives à une surface
  qui venait de bouger).
- La nouvelle place est renvoyée à Hush (`overlay:moved`) et enregistrée dans `S.ov` (`pos: "tl"`, x, y, w, h, écran).
- Hors layer-shell (mini-fenêtre normale), le bouton coupe seulement `setIgnoreMouseEvents` : on la fait glisser et
  la poignée change sa taille, avec le code qui existait déjà.
- Les curseurs « Écart avec le bord » vont maintenant jusqu'à 2000 px. Textes traduits dans les deux `i18n.js`.

Pièges trouvés en route (GTK par Python) : `GtkLayerShell.set_monitor(None)` et
`input_shape_combine_region(None)` sont refusés (on passe un vrai écran, et un rectangle pour « toute la surface ») ;
la zone « la souris passe à travers » est remise à chaque affichage (`map-event`), sinon l'overlay reprenait les clics
après le mode Déplacer.

## 3. niri : l'overlay ne saute plus d'un écran à l'autre (`src/niri.js`)

Avec plusieurs écrans et `focus-follows-mouse`, survoler un autre écran y active un bureau ; `NiriSticky` y déplaçait
alors l'overlay. Maintenant il garde la liste bureau → écran (`WorkspacesChanged`) et ne suit que les changements de
bureau **sur son propre écran**. Sert encore pour la mini-fenêtre normale (sans layer-shell).

## 4. niri : pas de flou derrière l'overlay (`renderer/app.js`, règle niri proposée)

Une règle niri `background-effect { blur true; }` pour toutes les fenêtres floutait le fond de l'overlay. La règle que
Hush propose de copier contient maintenant `background-effect { blur false; }`.
Attention : cette option n'existe que dans les niri récents (26.04 testé) ; sur un niri plus ancien, la config devient
invalide. Peut-être à rendre conditionnel, ou à signaler dans le texte d'aide.

## Environnement de développement sous Linux

Avec Node 26, `npm ci` termine sans erreur mais **Electron n'est pas décompressé** (`node_modules/electron/dist` presque
vide, pas de `path.txt`). Contournement : décompresser à la main le zip déjà téléchargé dans `~/.cache/electron`
dans `node_modules/electron/dist`, puis `printf electron > node_modules/electron/path.txt`. Avec Node 20 (demandé par
le projet), à vérifier.

Lancer Hush depuis le code sous niri :
```bash
cd vocal-studio-app && ./node_modules/electron/dist/electron . --no-sandbox --ozone-platform=wayland
```

## Reste à faire

- Tester sur Hyprland et Sway (la couche overlay y existe aussi) et sur GNOME (pas de layer-shell : l'ancienne
  mini-fenêtre doit prendre le relais).
- Écrire les paquets nécessaires dans le README et sur le site.
- Écran à l'échelle 1,5 ou 2 : l'image est mise à l'échelle par cairo, pas encore vérifié.
- Le texte d'aide en bas des voiles (mode Déplacer) n'est qu'en français.
