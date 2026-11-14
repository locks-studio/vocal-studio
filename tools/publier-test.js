// Prépare une version de test de Hush : seuls ceux qui ont le code d'accès la reçoivent, la version normale ne bouge pas.
// Lancer depuis la racine du projet : node tools/publier-test.js "Ce qui change" "Autre nouveauté"
// (ELECTRON_LINUX=dossier d'Electron pour Linux, sinon seule la version Windows est construite)
// Résultat : launcher/site/1999-test-a-envoyer.zip, à décompresser à la racine du site sur Hostinger.
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");


const ROOT = path.join(__dirname, "..");
const HUSH = path.join(ROOT, "vocal-studio-app");
const LAUNCHER = path.join(ROOT, "launcher");
const run = (cmd, args, cwd) => {
  // npx a besoin du shell sous Windows ; node et python non (leur chemin contient des espaces)
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: cmd === "npx" && process.platform === "win32" });
  if (r.status !== 0) { console.error(`\nÉchec : ${cmd} ${args.join(" ")}`); process.exit(1); }
};

const base = JSON.parse(fs.readFileSync(path.join(HUSH, "package.json"), "utf8")).version;
const d = new Date(), pad = (n) => String(n).padStart(2, "0");
const version = `${base}-test.${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
console.log(`Version de test : ${version}`);

// Le numéro de version est donné à la construction : package.json garde la version normale
const common = [`-c.extraMetadata.version=${version}`];
run("npx", ["electron-builder", "--win", "zip", "--x64", "-c.electronDist=node_modules/electron/dist", "-c.win.signAndEditExecutable=false", ...common], HUSH);
if (process.env.ELECTRON_LINUX) run("npx", ["electron-builder", "--linux", "zip", "--x64", `-c.electronDist="${process.env.ELECTRON_LINUX}"`, ...common], HUSH);
else console.log("ELECTRON_LINUX absent : pas de version Linux dans ce test.");

run(process.execPath, [path.join("tools", "make-catalog.js"), "--canal=test", `--version=${version}`, ...process.argv.slice(2).map((n) => `--note=${n}`)], LAUNCHER);

// Les fichiers de Hush sur GitHub (release « test-hush-v… », marquée pré-version) : il ne reste que le catalogue à envoyer
const testCat = fs.readdirSync(path.join(LAUNCHER, "site", "1999-test")).map((d) => path.join(LAUNCHER, "site", "1999-test", d, "catalog.json")).find((f) => fs.existsSync(f));
run(process.execPath, [path.join("tools", "publish-github.js"), `--catalog=${testCat}`], LAUNCHER);

// Une archive simple (le dossier test-<code>/), sans compression : ce sont déjà des zip
const site = path.join(LAUNCHER, "site", "1999-test");
const out = path.join(LAUNCHER, "site", "1999-test-a-envoyer.zip");
fs.rmSync(out, { force: true });
run("python", ["-c", `import shutil,zipfile,os
root=r'${site}'
z=zipfile.ZipFile(r'${out}','w',zipfile.ZIP_STORED)
for d,_,fs_ in os.walk(root):
    for f in fs_:
        p=os.path.join(d,f); z.write(p,os.path.relpath(p,root).replace(os.sep,'/'))
z.close()`], ROOT);
console.log(`\nPrêt : ${path.relative(ROOT, out)}`);
console.log("Décompresse-le à la racine du site sur Hostinger. Le code d'accès est dans launcher/publish.json (testCode).");

