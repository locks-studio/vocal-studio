// Prépare Hush Preview pour ceux qui ont sa clé : un catalogue signé, rangé dans le dossier secret de la clé
// (site/1999/prive-<empreinte>/), avec les fichiers compilés par vocal-studio-app/tools/build-preview.js.
// Rien ne part sur GitHub (les Releases sont publiques) : publish-ftp.js --dossier=<dossier> envoie seulement ce dossier.
//   CLE_PREVIEW=… PREVIEW_VERSION=0.5.9-preview.12 PREVIEW_NOTE="…" node tools/make-preview.js
// La clé vient du secret GitHub CLE_PREVIEW, ou de la ligne CLE_PREVIEW=… du fichier local cles-privees.env (jamais sur GitHub).
// Affiche le nom du dossier secret à la fin (pour publish-ftp.js).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const privateKey = require("../src/private-key");
const catalogSign = require("../src/catalog-sign");

const root = path.join(__dirname, "..");
const app = path.join(root, "..", "vocal-studio-app");
const cfg = JSON.parse(fs.readFileSync(path.join(root, "publish.json"), "utf8"));
const fail = (m) => { console.error(m); process.exit(1); };

let key = process.env.CLE_PREVIEW || "";
const keysFile = path.join(root, "cles-privees.env");
if (!key && fs.existsSync(keysFile)) key = (/^\s*CLE_PREVIEW\s*=\s*(.*)$/m.exec(fs.readFileSync(keysFile, "utf8")) || [])[1] || "";
key = key.trim().replace(/^["']|["']$/g, "");
if (privateKey.normalize(key).length < 4) fail("Clé de Hush Preview introuvable (secret CLE_PREVIEW, ou CLE_PREVIEW=… dans cles-privees.env) : rien n'est préparé.");
const signingKey = process.env.CATALOG_SIGNING_KEY || (fs.existsSync(path.join(root, "cle-signature.pem")) ? fs.readFileSync(path.join(root, "cle-signature.pem"), "utf8") : "");
if (!signingKey) fail("Clé de signature introuvable (cle-signature.pem ou CATALOG_SIGNING_KEY) : rien n'est préparé.");

const version = process.env.PREVIEW_VERSION || require(path.join(app, "package.json")).version + "-preview";
const folder = privateKey.folderFor(key);
const out = path.join(root, "site", "1999", folder);
const base = cfg.baseUrl.replace(/\/$/, "") + "/" + folder;
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const copy = (src, rel) => { const d = path.join(out, rel); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(src, d); return `${base}/${rel.split(path.sep).join("/")}`; };
const files = {
  "win32-x64": { file: `Hush-Preview-${version}-win-x64.zip`, exec: "Hush Preview.exe" },
  "linux-x64": { file: `Hush-Preview-${version}-linux-x64.zip`, exec: "hush-preview" },
};
const entry = {
  id: "hush-preview", name: "Hush Preview", kind: "Version de test de Hush", accent: "#ff5fa2", version,
  tagline: "La prochaine version de Hush, avant tout le monde : à tester avant sa sortie.",
  description: "Hush Preview s'installe à côté de Hush, avec ses propres réglages. Elle contient les nouveautés pas encore publiées, et les fonctions en essai comme les clips (F9, façon Medal).",
  notes: [process.env.PREVIEW_NOTE || "Nouvelle version de test"].map((x) => String(x).split(/\r?\n/)[0].slice(0, 200)),
  usageDir: ["Hush Preview"], downloads: {},
};
const icon = path.join(app, "build", "icon-preview.png");
if (fs.existsSync(icon)) entry.icon = copy(icon, path.join("hush-preview", `icon-${sha(icon).slice(0, 8)}.png`));
for (const [plat, a] of Object.entries(files)) {
  const f = path.join(app, "dist", a.file);
  if (!fs.existsSync(f)) { console.log(`  Hush Preview ${plat} : absent (sauté)`); continue; }
  const data = fs.readFileSync(f);
  if (data.lastIndexOf(Buffer.from("PK\x05\x06")) < Math.max(0, data.length - 70000)) fail(`Archive abîmée, rien n'est publié : ${a.file}`);
  entry.downloads[plat] = { url: copy(f, path.join("hush-preview", version, a.file)), size: data.length, sha256: sha(f), exec: a.exec };
  console.log(`  Hush Preview ${plat} : ok (${(data.length / 1e6).toFixed(0)} Mo)`);
}
if (!Object.keys(entry.downloads).length) fail("Aucun fichier de Hush Preview à publier (lance d'abord vocal-studio-app/tools/build-preview.js).");
const cat = catalogSign.sign({ generatedAt: new Date().toISOString(), apps: [entry] }, signingKey);
if (!catalogSign.verify(cat)) fail("La clé de signature ne correspond pas à celle du launcher : rien n'est préparé.");
fs.writeFileSync(path.join(out, "catalog.json"), JSON.stringify(cat, null, 2));
console.log(`Hush Preview ${version} prêt.`);
console.log(`DOSSIER=${folder}`);
