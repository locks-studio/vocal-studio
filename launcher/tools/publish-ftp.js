// Publie le dossier site/1999 sur Hostinger par FTP (chiffré), sans zip ni gestionnaire de fichiers.
//   node tools/publish-ftp.js            → envoie ce qui a changé (les gros fichiers sur GitHub), le catalogue en dernier, puis vérifie en ligne
//   node tools/publish-ftp.js --test     → teste seulement la connexion (rien n'est envoyé)
//   node tools/publish-ftp.js --essai    → montre ce qui serait envoyé, sans rien envoyer
//   node tools/publish-ftp.js --dossier=prive-…  → envoie seulement ce dossier secret (Hush Preview), rien d'autre
// Après l'envoi : les dossiers secrets d'une ancienne clé (clé changée) sont supprimés du serveur, pour que l'ancienne
// clé ne donne plus accès à rien. Seuls ceux qui ne contiennent que des logiciels gérés par cette publication.
// Les identifiants FTP sont dans launcher/ftp.env (jamais sur GitHub) : FTP_HOST, FTP_USER, FTP_PASS, et FTP_DIR (facultatif).
// Ils passent à curl par son entrée standard : ils n'apparaissent ni à l'écran ni dans la liste des processus.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const site = path.join(root, "site", "1999");
const envFile = path.join(root, "ftp.env");
const args = process.argv.slice(2);
const TEST = args.includes("--test"), DRY = args.includes("--essai");
const SITE_URL = "https://1999.organisationphantom.fr";
const ONLY = (args.find((x) => x.startsWith("--dossier=")) || "").slice(10) || null;
const privateKey = require("../src/private-key");
if (ONLY && !privateKey.isFolder(ONLY)) { console.error("--dossier= doit être un dossier secret (prive-…)."); process.exit(1); }

function readEnv() {
  if (!fs.existsSync(envFile)) fail(`Fichier ${envFile} introuvable : remplis-le d'abord (voir ftp.env.exemple).`);
  const env = {};
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  for (const k of ["FTP_HOST", "FTP_USER", "FTP_PASS"]) if (!env[k]) fail(`${k} manque dans ftp.env.`);
  env.FTP_HOST = env.FTP_HOST.replace(/^s?ftps?:\/\//, "").replace(/\/.*$/, "");
  return env;
}
function fail(msg) { console.error(`\nÉchec : ${msg}`); process.exit(1); }

const env = readEnv();
// Hostinger : le certificat du serveur FTP est au nom de Hostinger (*.hstgr.io), pas de ton domaine.
// On se connecte bien à FTP_HOST, mais on vérifie le certificat avec un nom en .hstgr.io : la connexion reste
// chiffrée ET on est sûr de parler à un serveur Hostinger. FTP_TLS_NAME permet de choisir ce nom.
let tlsName = env.FTP_TLS_NAME || "";
// curl lit ses options (identifiants compris) sur l'entrée standard
function curl(opts, url, extra = []) {
  const cfg = [`user = "${env.FTP_USER.replace(/"/g, '\\"')}:${env.FTP_PASS.replace(/"/g, '\\"')}"`, ...opts].join("\n");
  const tls = env.FTP_TLS === "0" ? [] : ["--ssl-reqd"];
  const via = tlsName ? ["--connect-to", `${tlsName}:21:${env.FTP_HOST}:21`] : [];
  const r = spawnSync("curl", ["-sS", "--connect-timeout", "20", ...tls, ...via, "-K", "-", ...extra, url], { input: cfg, encoding: "utf8", maxBuffer: 1 << 26 });
  return { ok: r.status === 0, out: r.stdout || "", err: (r.stderr || "").replace(env.FTP_PASS, "***").trim(), code: r.status };
}
const base = (dir) => `ftp://${tlsName || env.FTP_HOST}/${dir ? dir.replace(/^\/|\/$/g, "") + "/" : ""}`;

// Le dossier du site sur le serveur : FTP_DIR, sinon on le devine (compte FTP limité à public_html/1999, ou à la racine)
function findDir() {
  if (env.FTP_DIR !== undefined && env.FTP_DIR !== "") return env.FTP_DIR.replace(/^\/|\/$/g, "");
  for (const d of ["", "public_html/1999", "1999", "domains/organisationphantom.fr/public_html/1999"]) {
    let r = curl([], base(d), ["--list-only"]);
    // Certificat au nom de Hostinger : on recommence en le vérifiant sous ce nom
    if (!r.ok && d === "" && !tlsName && /WRONG_PRINCIPAL|certificate|SSL: no alternative|does not match/i.test(r.err)) {
      tlsName = "ftp.hstgr.io";
      r = curl([], base(d), ["--list-only"]);
    }
    if (!r.ok) {
      if (d === "") {
        if (/530|login|Access denied/i.test(r.err)) fail("identifiant ou mot de passe FTP refusé. Vérifie ftp.env.");
        if (/SSL|TLS|certificate/i.test(r.err)) fail(`connexion chiffrée impossible (${r.err}). Préviens Claude.`);
        fail(`connexion impossible : ${r.err}`);
      }
      continue;
    }
    const names = r.out.split(/\r?\n/).map((x) => x.trim());
    if (names.includes("catalog.json") && names.includes("hush")) return d;
  }
  fail("dossier du site introuvable sur le serveur. Ajoute FTP_DIR=public_html/1999 (ou le bon chemin) dans ftp.env.");
}

// Taille d'un fichier sur le serveur (null s'il n'existe pas)
function remoteSize(dir, rel) {
  const r = curl([], base(dir) + rel.split("/").map(encodeURIComponent).join("/"), ["-I"]);
  if (!r.ok) return null;
  const m = /Content-Length:\s*(\d+)/i.exec(r.out);
  return m ? Number(m[1]) : null;
}

function walk(dir, pre = "") {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), pre + e.name + "/") : [pre + e.name]));
}

function upload(dir, rel) {
  const full = path.join(site, rel);
  const parts = rel.split("/");
  const name = parts.pop();
  const folder = base(dir) + parts.map(encodeURIComponent).join("/") + (parts.length ? "/" : "");
  const big = fs.statSync(full).size > 2e6;
  // Gros fichier : envoyé sous un nom provisoire, puis renommé d'un coup (personne ne télécharge un fichier à moitié envoyé)
  const tmp = big ? name + ".envoi" : name;
  const r = curl([], folder + encodeURIComponent(tmp), ["--ftp-create-dirs", "-T", full, ...(big ? ["-Q", `-RNFR ${tmp}`, "-Q", `-RNTO ${name}`] : [])]);
  if (!r.ok) fail(`envoi de ${rel} impossible : ${r.err}`);
}

function get(url) {
  return new Promise((res, rej) => https.get(url, { headers: { "User-Agent": "1999-publication", "Cache-Control": "no-cache" } }, (r) => {
    const chunks = []; r.on("data", (c) => chunks.push(c)); r.on("end", () => res({ status: r.statusCode, body: Buffer.concat(chunks) }));
  }).on("error", rej));
}

(async () => {
  const CAT = ONLY ? `${ONLY}/catalog.json` : "catalog.json";
  if (!fs.existsSync(path.join(site, CAT))) fail(ONLY ? `${CAT} manque : lance d'abord node tools/make-preview.js.` : "site/1999 n'est pas prêt : lance d'abord node tools/make-catalog.js.");
  console.log(`Connexion à ${env.FTP_HOST}…`);
  const dir = findDir();
  console.log(`Dossier du site : /${dir || "(racine du compte FTP)"}`);
  if (TEST) return console.log("\nConnexion FTP OK, rien n'a été envoyé.");

  // Les gros fichiers sur GitHub d'abord (voir publish-github.js) : le catalogue ne doit pas annoncer un lien vide
  console.log("");
  if (!ONLY) await require("./publish-github").publish(path.join(site, "catalog.json"), { dry: DRY });

  // Ce qu'il faut envoyer : les petits fichiers du site à chaque fois, les gros seulement s'ils manquent ou ont changé
  const files = walk(site).filter((f) => !/\.zip$/.test(f) || f.split("/").length > 1).filter((f) => f !== CAT).filter((f) => !ONLY || f.startsWith(ONLY + "/"));
  const todo = [];
  for (const rel of files) {
    const size = fs.statSync(path.join(site, rel)).size;
    if (size < 2e6) { todo.push(rel); continue; }
    if (remoteSize(dir, rel) !== size) todo.push(rel);
  }
  const big = todo.filter((r) => fs.statSync(path.join(site, r)).size >= 2e6);
  console.log(`\nÀ envoyer : ${todo.length} fichiers (dont ${big.length} gros : ${big.join(", ") || "aucun"}), puis ${CAT}.`);
  if (DRY) { cleanup(dir, true); return console.log("\nEssai seulement : rien n'a été envoyé."); }

  // Les gros d'abord, le site ensuite, le catalogue tout à la fin : il n'annonce une version que quand ses fichiers sont là
  const order = [...big, ...todo.filter((r) => !big.includes(r))];
  order.forEach((rel, i) => {
    const mo = (fs.statSync(path.join(site, rel)).size / 1e6).toFixed(0);
    process.stdout.write(`  [${i + 1}/${order.length}] ${rel}${mo > 1 ? ` (${mo} Mo)` : ""}… `);
    upload(dir, rel);
    console.log("ok");
  });
  process.stdout.write(`  ${CAT}… `);
  upload(dir, CAT);
  console.log("ok");

  // Vérification en ligne : le catalogue publié, et chaque gros fichier envoyé retéléchargé et comparé
  console.log("\nVérification sur https://1999.organisationphantom.fr …");
  const cat = JSON.parse(fs.readFileSync(path.join(site, CAT), "utf8"));
  const online = await get(`${SITE_URL}/${CAT}?v=${Date.now()}`);
  if (online.status !== 200 || online.body.toString() !== fs.readFileSync(path.join(site, CAT), "utf8")) fail("le catalogue en ligne n'est pas celui qu'on vient d'envoyer.");
  console.log("  catalogue : ok");
  // Tous les fichiers du catalogue : téléchargements du launcher (.exe, .dmg…), ses mises à jour (.zip Mac…) et les logiciels
  const all = [...Object.values((cat.launcher && cat.launcher.downloads) || {}), ...Object.values((cat.launcher && cat.launcher.updates) || {}), ...cat.apps.flatMap((a) => Object.values(a.downloads))];
  const seen = new Set();
  for (const d of all) {
    const rel = d.url.split("/").slice(3).join("/");
    if (!big.includes(rel) || seen.has(rel)) continue;
    seen.add(rel);
    const r = await get(d.url + "?v=" + Date.now());
    const ok = r.status === 200 && r.body.length === d.size && crypto.createHash("sha256").update(r.body).digest("hex") === d.sha256;
    console.log(`  ${rel} : ${ok ? "ok" : "ABÎMÉ"}`);
    if (!ok) fail(`${rel} en ligne ne correspond pas. Relance la publication.`);
  }
  await cleanup(dir, false);
  console.log("\nPublié et vérifié.");
})().catch((e) => fail(e.message));

// ——— Dossiers secrets d'une ancienne clé ———
// Un dossier prive-… sur le serveur qui n'est plus préparé ici, et qui ne contient QUE des logiciels gérés par cette
// publication (Hush Studio pour la publication normale, Hush Preview pour --dossier=) : son ancienne clé ne doit
// plus rien débloquer, il est supprimé. Un dossier inconnu ou illisible n'est jamais touché.
async function cleanup(dir, dry) {
  // Clés privées inconnues ici (publication à la main sans cles-privees.env) : on ne sait pas quels dossiers sont à jour, on ne touche à rien
  if (!ONLY && !process.env.CLES_PRIVEES && !fs.existsSync(path.join(root, "cles-privees.env"))) return;
  const managed = ONLY ? ["hush-preview"] : JSON.parse(fs.readFileSync(path.join(root, "publish.json"), "utf8")).apps.filter((a) => a.private).map((a) => a.id);
  const keep = new Set(ONLY ? [ONLY] : fs.readdirSync(site).filter(privateKey.isFolder));
  const r = curl([], base(dir), ["--list-only"]);
  if (!r.ok) return;
  for (const f of r.out.split(/\r?\n/).map((x) => x.trim()).filter(privateKey.isFolder)) {
    if (keep.has(f)) continue;
    let ids = null;
    try { const c = await get(`${SITE_URL}/${f}/catalog.json?v=${Date.now()}`); if (c.status === 200) ids = JSON.parse(c.body.toString()).apps.map((a) => a.id); } catch {}
    if (!ids || !ids.length || !ids.every((id) => managed.includes(id))) continue;
    console.log(`  Ancienne clé (${ids.join(", ")}) : ${dry ? "son dossier serait supprimé" : "dossier supprimé"} (${f.slice(0, 14)}…)`);
    if (!dry) removeTree(dir, f);
  }
}
function removeTree(dir, rel) {
  const full = (x) => (dir ? dir + "/" : "") + x;
  const r = curl([], base(dir) + rel.split("/").map(encodeURIComponent).join("/") + "/", ["--list-only"]);
  for (const n of (r.out || "").split(/\r?\n/).map((x) => x.trim()).filter((x) => x && x !== "." && x !== "..")) {
    const child = `${rel}/${n}`;
    // Un fichier : DELE suffit ; sinon c'est un dossier, vidé d'abord
    if (!curl([], base(dir), ["--list-only", "-Q", `DELE ${full(child)}`]).ok) removeTree(dir, child);
  }
  curl([], base(dir), ["--list-only", "-Q", `RMD ${full(rel)}`]);
}
