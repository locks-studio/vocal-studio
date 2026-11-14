// Contrôles avant chaque version. À lancer depuis n'importe où : node tools/check.js [--smoke]
// make-catalog.js le lance et refuse de préparer le site si quelque chose échoue.
// --smoke : ouvre aussi Hush et le launcher pour de vrai et vérifie que les pages s'affichent sans erreur.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const problems = [];
let done = 0;
const fail = (m) => problems.push(m);
const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");
const walk = (d, ok) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) return /^(node_modules|dist|site|site-test|\.git)$/.test(e.name) ? [] : walk(p, ok);
  return ok(p) ? [p] : [];
});

// 1. Tout le JavaScript se lit sans erreur de syntaxe
for (const d of ["vocal-studio-app/src", "vocal-studio-app/renderer", "hush-studio/src", "hush-studio/renderer", "hush-studio/test", "vocal-studio-bot/src", "launcher/src", "launcher/renderer", "launcher/tools", "launcher/website", "tools"]) {
  for (const f of walk(path.join(ROOT, d), (p) => p.endsWith(".js"))) {
    try { new vm.Script(fs.readFileSync(f, "utf8").replace(/^#!.*/, ""), { filename: f }); done++; }
    catch (e) { fail(`${rel(f)} : ${e.message}`); }
  }
}

// 2. Les fichiers de réglages sont du JSON valide
for (const f of ["vocal-studio-app/package.json", "hush-studio/package.json", "vocal-studio-bot/package.json", "launcher/package.json", "launcher/publish.json", "launcher/config.json"]) {
  try { JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")); done++; } catch (e) { fail(`${f} : ${e.message}`); }
}

// 3. Chaque page charge des fichiers qui existent et qui ne sont pas vides
const pages = ["vocal-studio-app/renderer/index.html", "hush-studio/renderer/index.html", "launcher/renderer/index.html", "launcher/website/index.html"];
for (const page of pages) {
  const html = fs.readFileSync(path.join(ROOT, page), "utf8");
  for (const [, src] of html.matchAll(/(?:src|href)="([^"#:]+\.(?:js|css|png))"/g)) {
    const f = path.join(ROOT, path.dirname(page), src);
    if (!fs.existsSync(f)) fail(`${page} charge ${src}, qui n'existe pas`);
    else if (fs.statSync(f).size < 50) fail(`${page} charge ${src}, presque vide`);
    done++;
  }
}

// 4. Chaque $("#identifiant") du code existe dans la page (ou est créé par le code)
for (const [page, dir] of [["vocal-studio-app/renderer/index.html", "vocal-studio-app/renderer"], ["hush-studio/renderer/index.html", "hush-studio/renderer"], ["launcher/renderer/index.html", "launcher/renderer"]]) {
  const html = fs.readFileSync(path.join(ROOT, page), "utf8");
  for (const f of walk(path.join(ROOT, dir), (p) => p.endsWith(".js"))) {
    const code = fs.readFileSync(f, "utf8");
    for (const [, id] of code.matchAll(/\$\("#([\w-]+)"\)/g)) {
      if (!html.includes(`id="${id}"`) && !code.includes(`"${id}"`) && !code.includes(`id = "${id}"`)) fail(`${rel(f)} utilise #${id}, absent de la page`);
      done++;
    }
  }
}

// 5. Aucun fichier important n'a fondu depuis la dernière sauvegarde (c'est ce qui avait vidé style.css)
const tracked = spawnSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).stdout.split("\n").filter((f) => /\.(js|css|html|ps1|py)$/.test(f));
for (const f of tracked) {
  const old = spawnSync("git", ["show", `HEAD:${f}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 });
  const p = path.join(ROOT, f);
  if (old.status !== 0 || !fs.existsSync(p)) continue;
  const before = old.stdout.length, now = fs.statSync(p).size;
  if (before > 2000 && now < before * 0.6) fail(`${f} a perdu ${Math.round((1 - now / before) * 100)} % de sa taille depuis la dernière sauvegarde`);
  done++;
}

// 6. Aucun secret dans les fichiers suivis
const SECRET = /[MNO][A-Za-z0-9_-]{23,27}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}|gh[pousr]_[A-Za-z0-9]{30,}|sk-or-v1-[A-Za-z0-9]{20,}/;
for (const f of spawnSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).stdout.split("\n").filter(Boolean)) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p) || fs.statSync(p).size > 2e6 || /\.(png|ico|icns|jpg)$/.test(f)) continue;
  if (SECRET.test(fs.readFileSync(p, "utf8"))) fail(`${f} semble contenir un secret`);
  if (/(^|\/)(\.env|sessions\.json|friends\.json|usage\.json|reports\.json)$/.test(f)) fail(`${f} ne doit pas être dans l'historique`);
}

// 7. Les deux copies du dictionnaire sont identiques
if (fs.readFileSync(path.join(ROOT, "vocal-studio-app/renderer/i18n.js"), "utf8") !== fs.readFileSync(path.join(ROOT, "launcher/renderer/i18n.js"), "utf8")) fail("les deux copies de i18n.js sont différentes");
done++;

// 7 bis. Tests des modules
for (const t of [...walk(path.join(ROOT, "vocal-studio-bot/test"), (p) => p.endsWith(".test.js")), ...walk(path.join(ROOT, "launcher/test"), (p) => p.endsWith(".test.js")), ...walk(path.join(ROOT, "hush-studio/test"), (p) => p.endsWith(".test.js"))]) {
  const r = spawnSync(process.execPath, [t], { encoding: "utf8" });
  if (r.status !== 0) fail(`${rel(t)} : ${(r.stderr || r.stdout).trim().split("\n").slice(0, 6).join(" | ")}`);
  done++;
}

// 8. Essai réel des deux applis
if (process.argv.includes("--smoke")) {
  const r = spawnSync(process.execPath, [path.join(__dirname, "smoke.js")], { encoding: "utf8", timeout: 120_000 });
  process.stdout.write(r.stdout || "");
  if (r.status !== 0) fail(`essai réel : ${(r.stderr || r.stdout || "délai dépassé").trim().split("\n").slice(-4).join(" | ")}`);
  done++;
}

if (problems.length) {
  console.error(`\n${problems.length} problème(s) :`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`Contrôles OK (${done} vérifications).`);
