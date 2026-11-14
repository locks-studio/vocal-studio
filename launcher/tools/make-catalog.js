// Prépare le dossier à envoyer sur le site (Hostinger) :
//   site/1999/catalog.json            ← la liste des logiciels, versions, liens et empreintes SHA-256
//   site/1999/<id>/<version>/…zip      ← les fichiers à télécharger
//   site/1999/<id>/icon-<empreinte>.png ← l'icône affichée dans le launcher
//   site/1999/launcher/…               ← l'installeur du launcher lui-même
//   site/1999/index.html, style.css…   ← le site de présentation, copié depuis website/
// Utilisation : node tools/make-catalog.js   (lit publish.json)
// Une plateforme dont le fichier n'existe pas encore (ex. Mac pas encore construit) est simplement sautée :
// le launcher affichera « Bientôt » sur ce système.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Contrôles d'abord : rien ne part si quelque chose est cassé (--sans-controles pour le test local uniquement)
if (!process.argv.includes("--sans-controles")) {
  const r = require("child_process").spawnSync(process.execPath, [path.join(__dirname, "..", "..", "tools", "check.js"), "--smoke"], { stdio: "inherit" });
  if (r.status !== 0) { console.error("\nSite NON préparé : corrige d'abord les problèmes ci-dessus."); process.exit(1); }
}

const root = path.join(__dirname, "..");
const privateKey = require("../src/private-key");
const cfg = JSON.parse(fs.readFileSync(path.join(root, "publish.json"), "utf8"));
// --out=site-test : dossier de sortie (le test local n'écrase jamais le vrai dossier à envoyer)
const outArg = process.argv.find((x) => x.startsWith("--out="));
// --canal=test : version réservée à ceux qui ont le code. Elle part dans son propre dossier (test-<code>/) :
// ni le catalogue normal, ni le site, ni les installeurs du launcher ne sont touchés.
const testChannel = process.argv.includes("--canal=test");
const versionArg = process.argv.find((x) => x.startsWith("--version="));
const testNotes = process.argv.filter((x) => x.startsWith("--note=")).map((x) => x.slice(7));
if (testChannel && !cfg.testCode) { console.error("testCode manque dans publish.json."); process.exit(1); }
const out = testChannel ? path.join(root, "site", "1999-test", `test-${cfg.testCode}`) : path.join(root, outArg ? outArg.slice(6) : "site", "1999");
// --base=… remplace l'adresse du site (ex. file:///C:/…/site/1999 pour tester sans rien mettre en ligne)
const baseArg = process.argv.find((x) => x.startsWith("--base="));
const base = (baseArg ? baseArg.slice(7) : cfg.baseUrl + (testChannel ? `/test-${cfg.testCode}` : "")).replace(/\/$/, "");
const abs = (p) => path.resolve(root, p);
const sha = (f) => {
  const data = fs.readFileSync(f);
  // Un zip se termine par son sommaire : sans lui, le fichier est coupé et l'installation échouerait chez tout le monde
  if (f.endsWith(".zip") && data.lastIndexOf(Buffer.from("PK\x05\x06")) < Math.max(0, data.length - 70000)) {
    console.error(`Archive abîmée, rien n'est publié : ${f}`);
    process.exit(1);
  }
  return crypto.createHash("sha256").update(data).digest("hex");
};
const copy = (src, rel) => { const d = path.join(out, rel); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(src, d); return `${base}/${rel.split(path.sep).join("/")}`; };

// Les gros fichiers (logiciels, installeurs et mises à jour du launcher) sont téléchargés depuis les Releases GitHub
// du dépôt publish.json › github.repo, une release par version (hush-v0.5.2, launcher-v0.5.1…).
// Ils sont rangés dans site/github/<release>/ ; tools/publish-github.js les envoie AVANT le catalogue.
// Sans github.repo, ou avec --base=… (test local), ils restent sur le site comme avant.
const repo = !baseArg && cfg.github && cfg.github.repo;
const ghOut = path.join(root, "site", "github");
const shipped = new Set();
const ship = (src, tag, rel) => {
  if (!repo) return copy(src, rel);
  const dir = path.join(ghOut, tag);
  if (!shipped.has(tag)) { shipped.add(tag); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); }
  fs.copyFileSync(src, path.join(dir, path.basename(src)));
  return `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(path.basename(src))}`;
};

// Logiciels privés (« private »: true dans publish.json) : absents du catalogue public. Chaque clé d'accès a son
// dossier secret (prive-<empreinte de la clé>/) avec son propre catalogue et ses fichiers, jamais sur GitHub.
// Les clés viennent du secret CLES_PRIVEES (« cle:app1,app2;cle2:app3 ») ou du fichier local cles-privees.env
// (jamais sur GitHub). Sans clé, un logiciel privé n'est publié nulle part.
let keysTxt = process.env.CLES_PRIVEES || "";
const keysFile = path.join(root, "cles-privees.env");
if (!keysTxt && fs.existsSync(keysFile)) keysTxt = (/^\s*CLES_PRIVEES\s*=\s*(.*)$/m.exec(fs.readFileSync(keysFile, "utf8")) || [])[1] || "";
const privateKeys = testChannel ? [] : privateKey.parseKeys(keysTxt.replace(/^["']|["']$/g, ""));

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const catalog = { generatedAt: new Date().toISOString(), apps: [] };
const report = [];

const privateEntries = new Map(); // id → entrée (fichiers rangés à part, pour chaque dossier secret)
for (const a of cfg.apps) {
  if (a.private) { privateEntries.set(a.id, a); continue; }
  const version = versionArg ? versionArg.slice(10) : JSON.parse(fs.readFileSync(abs(a.package), "utf8")).version;
  const entry = { id: a.id, name: a.name, kind: a.kind, tagline: a.tagline, description: a.description, accent: a.accent, version, notes: testNotes.length ? testNotes : a.notes || [], usageDir: a.usageDir, downloads: {} };
  if (a.icon && fs.existsSync(abs(a.icon))) entry.icon = copy(abs(a.icon), path.join(a.id, `icon-${sha(abs(a.icon)).slice(0, 8)}${path.extname(a.icon)}`)); // nom lié au contenu : le cache du CDN ne peut pas servir une ancienne icône
  if (a.banner && fs.existsSync(abs(a.banner))) entry.banner = copy(abs(a.banner), path.join(a.id, "banner" + path.extname(a.banner)));
  for (const [plat, art] of Object.entries(a.artifacts)) {
    const f = abs(art.file.replace("{version}", version));
    if (!fs.existsSync(f)) { report.push(`  ${a.name} ${plat} : absent (sauté) — ${path.relative(root, f)}`); continue; }
    entry.downloads[plat] = { url: ship(f, `${testChannel ? "test-" : ""}${a.id}-v${version}`, path.join(a.id, version, path.basename(f))), size: fs.statSync(f).size, sha256: sha(f), exec: art.exec };
    report.push(`  ${a.name} ${plat} : ok (${(fs.statSync(f).size / 1e6).toFixed(0)} Mo)`);
  }
  catalog.apps.push(entry);
}

// Les logiciels privés, dans le dossier secret de chaque clé (icône et fichiers copiés sur le site, pas sur GitHub)
for (const k of privateKeys) {
  const folder = privateKey.folderFor(k.key);
  const priv = { generatedAt: catalog.generatedAt, apps: [] };
  for (const id of k.apps) {
    const a = privateEntries.get(id);
    if (!a) { report.push(`  Clé privée : logiciel « ${id} » inconnu (pas de « private »: true dans publish.json)`); continue; }
    const version = JSON.parse(fs.readFileSync(abs(a.package), "utf8")).version;
    const entry = { id: a.id, name: a.name, kind: a.kind, tagline: a.tagline, description: a.description, accent: a.accent, version, notes: a.notes || [], usageDir: a.usageDir, downloads: {} };
    if (a.icon && fs.existsSync(abs(a.icon))) entry.icon = copy(abs(a.icon), path.join(folder, a.id, `icon-${sha(abs(a.icon)).slice(0, 8)}${path.extname(a.icon)}`));
    for (const [plat, art] of Object.entries(a.artifacts)) {
      const f = abs(art.file.replace("{version}", version));
      if (!fs.existsSync(f)) { report.push(`  ${a.name} (privé) ${plat} : absent (sauté)`); continue; }
      entry.downloads[plat] = { url: copy(f, path.join(folder, a.id, version, path.basename(f))), size: fs.statSync(f).size, sha256: sha(f), exec: art.exec };
      report.push(`  ${a.name} (privé) ${plat} : ok (${(fs.statSync(f).size / 1e6).toFixed(0)} Mo)`);
    }
    priv.apps.push(entry);
  }
  fs.mkdirSync(path.join(out, folder), { recursive: true });
  fs.writeFileSync(path.join(out, folder, "catalog.json"), JSON.stringify(priv, null, 2));
  report.push(`  Clé privée (${k.apps.join(", ")}) : catalogue secret prêt`);
}
for (const id of privateEntries.keys()) if (!privateKeys.some((k) => k.apps.includes(id))) report.push(`  ${id} : privé, aucune clé d'accès fournie → pas publié`);

// Le launcher lui-même : ses installeurs
if (cfg.launcher && !testChannel) {
  const lv = JSON.parse(fs.readFileSync(abs(cfg.launcher.package), "utf8")).version;
  catalog.launcher = { version: lv, page: cfg.launcher.page, downloads: {} };
  for (const [plat, p] of Object.entries(cfg.launcher.artifacts)) {
    // Plusieurs fichiers possibles (installeur, sinon zip) : le premier qui existe
    const f = [].concat(p).map((x) => abs(x.replace("{version}", lv))).find((x) => fs.existsSync(x)) || abs([].concat(p)[0]);
    if (!fs.existsSync(f)) { report.push(`  Launcher ${plat} : absent (sauté)`); continue; }
    const url = ship(f, `launcher-v${lv}`, path.join("launcher", path.basename(f)));
    catalog.launcher.downloads[plat] = { url, size: fs.statSync(f).size, sha256: sha(f) };
    report.push(`  Launcher ${plat} : ok`);
  }
  // Mise à jour automatique du launcher : le fichier que chaque système télécharge tout seul
  catalog.launcher.updates = {};
  for (const [plat, p] of Object.entries(cfg.launcher.updates || {})) {
    const f = abs(p.replace("{version}", lv));
    if (!fs.existsSync(f)) { report.push(`  Mise à jour auto du launcher ${plat} : absente (lien vers le site à la place)`); continue; }
    const url = ship(f, `launcher-v${lv}`, path.join("launcher", path.basename(f)));
    catalog.launcher.updates[plat] = { url, size: fs.statSync(f).size, sha256: sha(f) };
  }
}

// Le site de présentation (website/) : copié tel quel à la racine. Il lit ./catalog.json pour ses boutons de téléchargement.
if (!testChannel) {
const site = path.join(root, "website");
if (fs.existsSync(site)) {
  fs.cpSync(site, out, { recursive: true }); // .htaccess compris : Hostinger en a besoin
  // Le CDN de Hostinger garde style.css et site.js en cache : chaque lien porte l'empreinte du fichier (?v=…),
  // pour qu'une nouvelle page ne puisse jamais s'afficher avec d'anciens styles.
  for (const f of fs.readdirSync(out).filter((x) => x.endsWith(".html"))) {
    const page = path.join(out, f);
    const html = fs.readFileSync(page, "utf8").replace(/(["'])(\/?)(style\.css|site\.js|hush-fond\.js|img\/[^"'?]+)\1/g, (m, q, slash, file) => {
      const target = path.join(out, file);
      return fs.existsSync(target) ? `${q}${slash}${file}?v=${sha(target).slice(0, 10)}${q}` : m;
    });
    fs.writeFileSync(page, html);
  }
  report.push("  Site web : copié depuis website/");
} else {
  report.push("  Site web : dossier website/ absent, pas de page d'accueil");
}
}

fs.writeFileSync(path.join(out, "catalog.json"), JSON.stringify(catalog, null, 2));
console.log(`Dossier prêt : ${path.relative(process.cwd(), out)}`);
console.log(report.join("\n"));
if (catalog.launcher && !Object.keys(catalog.launcher.downloads).length) {
  console.log(`\nATTENTION : aucun installeur du launcher ${catalog.launcher.version} dans dist/. Le site afficherait « Bientôt » partout.`);
  console.log("Compile d'abord le launcher à cette version, puis relance cette commande. N'envoie pas ce dossier sur Hostinger.");
}
if (shipped.size) console.log(`\nFichiers pour GitHub (${repo}) : ${[...shipped].join(", ")}. Ils partent avant le catalogue avec npm run publier (ou node tools/publish-github.js).`);
console.log(`\nEnvoie le CONTENU de ce dossier dans le dossier du sous-domaine sur Hostinger (adresse finale : ${base}/catalog.json).`);
