// Compile Hush Preview : le même code que Hush, sous un autre nom (réglages à part, s'installe à côté de Hush),
// avec son icône et les fonctions en essai (clips). Publié seulement pour ceux qui ont sa clé dans 1999.
//   node tools/build-preview.js                     → pour ce système (Windows ou Linux), version = celle de Hush + « -preview »
//   PREVIEW_VERSION=0.5.9-preview.12 node tools/build-preview.js   → version imposée (la publication automatique le fait)
const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const version = process.env.PREVIEW_VERSION || require("../package.json").version + "-preview";
const target = process.platform === "win32" ? ["--win", "zip", "--x64"] : process.platform === "darwin" ? ["--mac", "zip"] : ["--linux", "zip", "--x64"];
const args = [
  "electron-builder", ...target, "--publish", "never",
  "-c.appId=fr.locks.hush.preview",
  "-c.productName=Hush Preview",
  "-c.artifactName=Hush-Preview-${version}-${os}-${arch}.${ext}",
  "-c.win.icon=build/icon-preview.png",
  "-c.linux.icon=build/icon-preview.png",
  "-c.mac.icon=build/icon-preview.png",
  "-c.linux.executableName=hush-preview",
  `-c.extraMetadata.version=${version}`,
  "-c.extraMetadata.productName=Hush Preview",
  "-c.extraMetadata.name=hush-preview",
  "-c.extraMetadata.hushPreview=true",
];
console.log(`Hush Preview ${version}…`);
// electron-builder lancé directement par Node (sans shell) : « Hush Preview » reste un seul argument, espace compris
const cli = require.resolve("electron-builder/cli.js", { paths: [root] });
const r = spawnSync(process.execPath, [cli, ...args.slice(1)], { cwd: root, stdio: "inherit" });
process.exit(r.status || 0);
