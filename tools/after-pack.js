// Juste après l'empaquetage d'une appli (afterPack d'electron-builder), avant le zip / l'installeur :
//  1. les « fusibles » d'Electron, gravés dans le programme (anti-détournement, anti-crack) ;
//  2. sur Mac, la signature ad hoc (après les fusibles : les changer modifie le programme).
// Fusibles :
//  - RunAsNode coupé : on ne peut pas détourner Hush.exe (ELECTRON_RUN_AS_NODE) pour lancer n'importe quel script ;
//  - NODE_OPTIONS et --inspect coupés : impossible d'injecter du code ou de brancher un débogueur pour l'espionner ;
//  - intégrité de l'app.asar vérifiée au démarrage (Windows, Mac) et code chargé seulement depuis app.asar :
//    une appli dont le code a été modifié refuse de démarrer ;
//  - cookies chiffrés sur le disque.
const path = require("path");

exports.default = async function (context) {
  const { electronPlatformName: plat, appOutDir, packager } = context;
  // @electron/fuses est installé dans chaque appli (vocal-studio-app, launcher, hush-studio), pas à la racine
  const dir = (packager.info && packager.info.projectDir) || packager.projectDir || process.cwd();
  const { flipFuses, FuseVersion, FuseV1Options } = require(require.resolve("@electron/fuses", { paths: [dir] }));
  const name = packager.appInfo.productFilename;
  const target = plat === "darwin" ? path.join(appOutDir, `${name}.app`)
    : plat === "win32" ? path.join(appOutDir, `${name}.exe`)
    : path.join(appOutDir, packager.executableName);
  await flipFuses(target, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: plat === "darwin",
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.EnableCookieEncryption]: true,
  });
  console.log(`  • fusibles de sécurité : ${path.basename(target)}`);
  if (plat === "darwin") await require("./mac-adhoc-sign").default(context);
};
