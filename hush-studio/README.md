# Hush Studio

Monte tes vocaux Discord dans le style Hush. Tu importes l'audio, Hush Studio recrée la scène (avatars, anneaux
qui s'allument au vrai volume de chacun, caméra qui suit celui qui parle), tu montes sur la timeline, tu exportes en MP4.

## Lancer en développement
    cd hush-studio
    npm install
    npm start

La scène affichée est **le vrai rendu de Hush** (`../vocal-studio-app/renderer`), copié dans l'appli à la
fabrication (`extraResources`). Toute amélioration visuelle de Hush arrive donc dans Hush Studio à la version suivante.

## Comment ça marche
- `src/craig.js` : lit un zip Craig (une piste par personne, pseudos et ID Discord dans info.txt).
- `src/audio.js` : ffmpeg mesure le volume toutes les 20 ms, avec la même échelle que le bot 1999 (-55 dB → 0, -10 dB → 1).
- `src/fake-studio.js` : le faux « Discord » que la page de Hush attend ; le vocal vient de la timeline.
- `src/export-preload.js` : l'horloge maîtrisée de l'export (temps, animations CSS et hasard avancent image par image).
- `src/export.js` : mélange du son puis rendu des images dans une fenêtre invisible, envoyées à ffmpeg (H.264 + AAC).
- `renderer/` : l'éditeur (timeline, panneau, aperçu, export).

## Tester sans cliquer
    HS_TEST_SHOT=capture.png HS_TEST_IMPORT=craig.zip HS_TEST_AT=600 HS_TEST_EXPORT=essai.mp4 HS_TEST_EXPORT_LEN=5 npx electron .
Importe, vérifie les gestes de montage (journal `capture.log`), prend des captures, exporte 5 s, puis quitte.
`HS_TEST_DATA=dossier` isole les données de test.

## Fabriquer
`npm run dist:win` (ou par GitHub : workflows « Construire » et « Version Mac »). Le zip va dans `dist/`,
puis `node launcher/tools/make-catalog.js` l'ajoute au catalogue 1999.
