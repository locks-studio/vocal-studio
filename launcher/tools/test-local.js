// Tester le launcher sans rien mettre en ligne :
// 1. fabrique Hush pour ce système s'il n'existe pas encore (Windows : avec l'Electron déjà installé),
// 2. prépare un catalogue local (liens file:// vers launcher/site/1999),
// 3. ouvre le launcher dessus. Il installe Hush comme le ferait ton ami, depuis ce dossier au lieu du site.
const { spawnSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const root = path.join(__dirname, "..");
const hushDir = path.join(root, "..", "vocal-studio-app");
const version = JSON.parse(fs.readFileSync(path.join(hushDir, "package.json"), "utf8")).version;
const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) { console.error(`\nÉchec de : ${cmd} ${args.join(" ")}`); process.exit(1); }
};

// 1. Hush pour ce système
const plat = { win32: "win", darwin: "mac", linux: "linux" }[process.platform];
const zip = path.join(hushDir, "dist", `Hush-${version}-${plat}-${process.arch}.zip`);
// (refabriqué si le code de Hush a changé depuis)
const newest = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((m, e) => Math.max(m, e.isDirectory() ? newest(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).mtimeMs), 0);
const stale = fs.existsSync(zip) && Math.max(newest(path.join(hushDir, "src")), newest(path.join(hushDir, "renderer"))) > fs.statSync(zip).mtimeMs;
if (!fs.existsSync(zip) || stale) {
  console.log(`Fabrication de Hush ${version} pour ce système (quelques minutes, une seule fois)…`);
  if (process.platform === "win32") run("npx", ["electron-builder", "--win", "zip", "--x64", "-c.electronDist=node_modules/electron/dist", "-c.win.signAndEditExecutable=false"], hushDir);
  else run("npm", ["run", `dist:${plat}`], hushDir);
}

// 2. Catalogue local
const base = pathToFileURL(path.join(root, "site-test", "1999")).href;
run("node", [path.join("tools", "make-catalog.js"), `--base=${base}`, "--out=site-test", "--sans-controles"], root);

// 3. Le launcher, branché sur ce catalogue
const electron = require(path.join(root, "node_modules", "electron"));
console.log("\nOuverture du launcher 1999…");
const extra = process.env.LAUNCHER_DEBUG_PORT ? [`--remote-debugging-port=${process.env.LAUNCHER_DEBUG_PORT}`] : [];
spawn(electron, [".", `--catalog=${base}/catalog.json`, ...extra], { cwd: root, detached: true, stdio: "ignore" }).unref();
