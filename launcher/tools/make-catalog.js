// Prépare le dossier à envoyer sur le site (Hostinger) :
//   site/1999/catalog.json            ← la liste des logiciels, versions, liens et empreintes SHA-256
//   site/1999/<id>/<version>/…zip      ← les fichiers à télécharger
//   site/1999/<id>/icon.png            ← l'icône affichée dans le launcher
//   site/1999/launcher/…               ← l'installeur du launcher lui-même, et une petite page de téléchargement
// Utilisation : node tools/make-catalog.js   (lit publish.json)
// Une plateforme dont le fichier n'existe pas encore (ex. Mac pas encore construit) est simplement sautée :
// le launcher affichera « Bientôt » sur ce système.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const cfg = JSON.parse(fs.readFileSync(path.join(root, "publish.json"), "utf8"));
// --out=site-test : dossier de sortie (le test local n'écrase jamais le vrai dossier à envoyer)
const outArg = process.argv.find((x) => x.startsWith("--out="));
const out = path.join(root, outArg ? outArg.slice(6) : "site", "1999");
// --base=… remplace l'adresse du site (ex. file:///C:/…/site/1999 pour tester sans rien mettre en ligne)
const baseArg = process.argv.find((x) => x.startsWith("--base="));
const base = (baseArg ? baseArg.slice(7) : cfg.baseUrl).replace(/\/$/, "");
const abs = (p) => path.resolve(root, p);
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const copy = (src, rel) => { const d = path.join(out, rel); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(src, d); return `${base}/${rel.split(path.sep).join("/")}`; };

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const catalog = { generatedAt: new Date().toISOString(), apps: [] };
const report = [];

for (const a of cfg.apps) {
  const version = JSON.parse(fs.readFileSync(abs(a.package), "utf8")).version;
  const entry = { id: a.id, name: a.name, kind: a.kind, tagline: a.tagline, description: a.description, accent: a.accent, version, notes: a.notes || [], downloads: {} };
  if (a.icon && fs.existsSync(abs(a.icon))) entry.icon = copy(abs(a.icon), path.join(a.id, "icon" + path.extname(a.icon)));
  if (a.banner && fs.existsSync(abs(a.banner))) entry.banner = copy(abs(a.banner), path.join(a.id, "banner" + path.extname(a.banner)));
  for (const [plat, art] of Object.entries(a.artifacts)) {
    const f = abs(art.file.replace("{version}", version));
    if (!fs.existsSync(f)) { report.push(`  ${a.name} ${plat} : absent (sauté) — ${path.relative(root, f)}`); continue; }
    entry.downloads[plat] = { url: copy(f, path.join(a.id, version, path.basename(f))), size: fs.statSync(f).size, sha256: sha(f), exec: art.exec };
    report.push(`  ${a.name} ${plat} : ok (${(fs.statSync(f).size / 1e6).toFixed(0)} Mo)`);
  }
  catalog.apps.push(entry);
}

// Le launcher lui-même : ses installeurs et une page de téléchargement simple
if (cfg.launcher) {
  const lv = JSON.parse(fs.readFileSync(abs(cfg.launcher.package), "utf8")).version;
  const links = [];
  catalog.launcher = { version: lv, page: cfg.launcher.page, downloads: {} };
  for (const [plat, p] of Object.entries(cfg.launcher.artifacts)) {
    // Plusieurs fichiers possibles (installeur, sinon zip) : le premier qui existe
    const f = [].concat(p).map((x) => abs(x.replace("{version}", lv))).find((x) => fs.existsSync(x)) || abs([].concat(p)[0]);
    if (!fs.existsSync(f)) { report.push(`  Launcher ${plat} : absent (sauté)`); continue; }
    const url = copy(f, path.join("launcher", path.basename(f)));
    catalog.launcher.downloads[plat] = { url, size: fs.statSync(f).size, sha256: sha(f) };
    links.push([plat, url, path.basename(f)]);
    report.push(`  Launcher ${plat} : ok`);
  }
  const names = { "win32-x64": "Windows", "darwin-arm64": "Mac (Apple Silicon : M1, M2, M3…)", "darwin-x64": "Mac (Intel)", "linux-x64": "Linux" };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  fs.writeFileSync(path.join(out, "index.html"), `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>1999 · Télécharger</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#07060b;color:#f4f2fa;font-family:system-ui,sans-serif">
<main style="width:min(520px,92vw);text-align:center"><h1 style="font-size:64px;margin:0;text-shadow:0 0 24px #ff3caa">1999</h1>
<p style="color:#9a95ad">Le launcher de Locks : installe et met à jour Hush et les prochains logiciels. Version ${esc(lv)}.</p>
${links.map(([p, u, n]) => `<p><a href="${esc(u)}" style="display:block;padding:14px;border-radius:12px;background:#ff3caa;color:#fff;text-decoration:none;font-weight:700">Télécharger pour ${esc(names[p] || p)}</a></p>`).join("")}
<p style="color:#9a95ad;font-size:13px">Windows peut afficher « Windows a protégé votre ordinateur » : clique sur « Informations complémentaires » puis « Exécuter quand même ». Sur Mac : clic droit sur l'app › Ouvrir. Sur Linux : décompresse l'archive, puis double-clic sur <b>launcher-1999</b> (ou <code>./launcher-1999</code> dans un terminal).</p></main></body></html>`);
}

fs.writeFileSync(path.join(out, "catalog.json"), JSON.stringify(catalog, null, 2));
console.log(`Dossier prêt : ${path.relative(process.cwd(), out)}`);
console.log(report.join("\n"));
console.log(`\nEnvoie le CONTENU de ce dossier dans le dossier du sous-domaine sur Hostinger (adresse finale : ${base}/catalog.json).`);
