// Envoie sur les Releases GitHub les gros fichiers annoncés par un catalogue (logiciels, installeurs du launcher).
//   node tools/publish-github.js                         → pour site/1999/catalog.json
//   node tools/publish-github.js --catalog=site/1999-test/test-xxx/catalog.json
//   node tools/publish-github.js --essai                 → montre ce qui serait envoyé, sans rien envoyer
// make-catalog.js a rangé ces fichiers dans site/github/<release>/. publish-ftp.js lance ce script tout seul,
// avant d'envoyer le catalogue : le catalogue n'annonce une version que quand ses fichiers sont en ligne.
// Il faut la commande gh, connectée à un compte qui peut écrire dans le dépôt (gh auth login).
// Le dépôt doit être PUBLIC : les launchers téléchargent sans compte GitHub.
const fs = require("fs");
const path = require("path");
const https = require("https");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const ghDir = path.join(root, "site", "github");

function gh(args, opts = {}) {
  const r = spawnSync("gh", args, { encoding: "utf8", maxBuffer: 1 << 26, ...opts });
  if (r.error) throw new Error("la commande gh est introuvable : installe GitHub CLI (https://cli.github.com) puis lance gh auth login.");
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

// Code de réponse d'un lien, sans compte (comme un launcher), en suivant les redirections
function status(url, hops = 0) {
  return new Promise((res, rej) => {
    const req = https.request(url, { method: "HEAD", headers: { "User-Agent": "1999-publication" } }, (r) => {
      r.resume();
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && hops < 5) return res(status(new URL(r.headers.location, url).toString(), hops + 1));
      res({ code: r.statusCode, size: Number(r.headers["content-length"]) || 0 });
    });
    req.setTimeout(30_000, () => req.destroy(new Error("GitHub ne répond pas")));
    req.on("error", rej);
    req.end();
  });
}

// Fichiers GitHub d'un catalogue : [{ repo, tag, name, size, url, prerelease }]
function wanted(cat) {
  const all = [
    ...Object.values((cat.launcher && cat.launcher.downloads) || {}),
    ...Object.values((cat.launcher && cat.launcher.updates) || {}),
    ...(cat.apps || []).flatMap((a) => Object.values(a.downloads || {})),
  ];
  const seen = new Map();
  for (const d of all) {
    const m = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/download\/([^/]+)\/([^/?#]+)$/.exec(d.url || "");
    if (!m || seen.has(d.url)) continue;
    const tag = decodeURIComponent(m[2]);
    seen.set(d.url, { repo: m[1], tag, name: decodeURIComponent(m[3]), size: d.size, url: d.url, prerelease: tag.startsWith("test-") });
  }
  return [...seen.values()];
}

async function publish(catalogFile, { dry = false, log = console.log } = {}) {
  const files = wanted(JSON.parse(fs.readFileSync(catalogFile, "utf8")));
  if (!files.length) return false;
  const repos = [...new Set(files.map((f) => f.repo))];
  for (const f of files) {
    f.local = path.join(ghDir, f.tag, f.name);
    if (!fs.existsSync(f.local) || fs.statSync(f.local).size !== f.size) throw new Error(`${path.relative(root, f.local)} manque ou ne correspond pas au catalogue : relance make-catalog.js.`);
  }

  log(`GitHub : ${files.length} fichiers pour ${repos.join(", ")}`);
  if (gh(["auth", "status"]).ok === false) throw new Error("gh n'est pas connecté : lance gh auth login.");
  for (const repo of repos) {
    const r = gh(["repo", "view", repo, "--json", "visibility", "-q", ".visibility"]);
    if (!r.ok) throw new Error(`dépôt ${repo} introuvable (ou pas d'accès) : crée-le en public, ou corrige github.repo dans publish.json.`);
    if (r.out !== "PUBLIC") throw new Error(`le dépôt ${repo} est ${r.out.toLowerCase()} : les launchers ne pourraient pas télécharger. Rends-le public, ou mets dans github.repo un dépôt public à part pour les fichiers.`);
  }

  // Ce qui est déjà en ligne avec la bonne taille n'est pas renvoyé
  const tags = new Map();
  for (const f of files) {
    const key = `${f.repo} ${f.tag}`;
    if (!tags.has(key)) {
      const r = gh(["release", "view", f.tag, "-R", f.repo, "--json", "assets", "-q", ".assets[] | [.name, .size] | @tsv"]);
      tags.set(key, r.ok ? new Map(r.out.split("\n").filter(Boolean).map((l) => { const [n, s] = l.split("\t"); return [n, Number(s)]; })) : null);
    }
    f.release = tags.get(key);
  }
  const todo = files.filter((f) => !f.release || f.release.get(f.name) !== f.size);
  log(`  à envoyer : ${todo.length ? todo.map((f) => `${f.tag}/${f.name} (${(f.size / 1e6).toFixed(0)} Mo)`).join(", ") : "rien, tout est déjà en ligne"}`);
  if (dry) return true;

  for (const f of todo) {
    if (!tags.get(`${f.repo} ${f.tag}`)) {
      const what = f.tag.replace(/-v(?=\d)/, " ");
      const r = gh(["release", "create", f.tag, "-R", f.repo, "--title", what, "--notes", `Fichiers de ${what}, téléchargés par le launcher 1999.`, ...(f.prerelease ? ["--prerelease"] : ["--latest=false"])]);
      if (!r.ok) throw new Error(`création de la release ${f.tag} impossible : ${r.err}${/empty/i.test(r.err) ? " (le dépôt est vide : ajoute-lui un README)" : ""}`);
      tags.set(`${f.repo} ${f.tag}`, new Map());
    }
    process.stdout.write(`  ${f.tag}/${f.name}… `);
    // --clobber : remplace un envoi précédent coupé en route
    const r = gh(["release", "upload", f.tag, f.local, "-R", f.repo, "--clobber"], { stdio: ["ignore", "pipe", "pipe"] });
    if (!r.ok) throw new Error(`envoi de ${f.name} impossible : ${r.err}`);
    log("ok");
  }

  // Vérification comme un launcher : sans compte, chaque lien doit répondre avec la bonne taille
  for (const f of files) {
    const s = await status(f.url);
    if (s.code !== 200 || (s.size && s.size !== f.size)) throw new Error(`${f.url} répond ${s.code}${s.size ? ` (${s.size} octets au lieu de ${f.size})` : ""}.`);
  }
  log("  liens GitHub : ok");
  return true;
}

module.exports = { publish };

if (require.main === module) {
  const arg = process.argv.find((a) => a.startsWith("--catalog="));
  const file = path.resolve(root, arg ? arg.slice(10) : path.join("site", "1999", "catalog.json"));
  if (!fs.existsSync(file)) { console.error(`\nÉchec : ${file} introuvable : lance d'abord node tools/make-catalog.js.`); process.exit(1); }
  const dry = process.argv.includes("--essai");
  publish(file, { dry })
    .then((any) => console.log(!any ? "\nCe catalogue n'a aucun fichier sur GitHub." : dry ? "\nEssai seulement : rien n'a été envoyé." : "\nFichiers GitHub en ligne et vérifiés."))
    .catch((e) => { console.error(`\nÉchec : ${e.message}`); process.exit(1); });
}
