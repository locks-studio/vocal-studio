// Test des versions Mac, lancé par GitHub sur un vrai Mac (.github/workflows/mac.yml).
// Pour chaque zip : décompression exactement comme le fait le launcher 1999 (extract-zip),
// signature vérifiée, puis l'appli est lancée 20 s pour voir qu'elle tient debout (avec une capture d'écran).
// Utilisation : node tools/mac-test.js <zip> [<zip>…]
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, spawnSync } = require("child_process");
const extract = require(path.join(__dirname, "..", "launcher", "node_modules", "extract-zip"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = false;
const fail = (m) => { console.log(`  ÉCHEC : ${m}`); failed = true; };

(async () => {
  const shots = path.join(__dirname, "..", "mac-test");
  fs.mkdirSync(shots, { recursive: true });
  for (const zip of process.argv.slice(2)) {
    console.log(`\n${path.basename(zip)}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mac-test-"));
    await extract(path.resolve(zip), { dir });
    const appDir = fs.readdirSync(dir).find((f) => f.endsWith(".app"));
    if (!appDir) { fail("pas de .app dans le zip"); continue; }
    const app = path.join(dir, appDir);
    // Les liens symboliques des frameworks doivent avoir survécu à la décompression
    const cur = path.join(app, "Contents", "Frameworks", "Electron Framework.framework", "Versions", "Current");
    if (!fs.lstatSync(cur).isSymbolicLink()) fail("les liens symboliques d'Electron ont été perdus");
    const sig = spawnSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", app], { encoding: "utf8" });
    if (sig.status !== 0) fail(`signature invalide\n${sig.stderr}`);
    else console.log("  signature : ok");
    const plist = fs.readFileSync(path.join(app, "Contents", "Info.plist"), "utf8");
    const exe = (/<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/.exec(plist) || [])[1];
    const bin = path.join(app, "Contents", "MacOS", exe || "");
    if (!exe || !fs.existsSync(bin)) { fail("programme introuvable"); continue; }
    if (!(fs.statSync(bin).mode & 0o111)) fail("le programme n'est pas exécutable");
    for (const k of ["NSMicrophoneUsageDescription", "NSAppleEventsUsageDescription"]) {
      if (/Hush/.test(appDir) && !plist.includes(k)) fail(`${k} manque dans Info.plist`);
    }
    // L'architecture du programme : une version Intel sur ce Mac Apple Silicon passe par Rosetta
    console.log("  " + spawnSync("file", [bin], { encoding: "utf8" }).stdout.trim().split(": ").pop());
    const arch = /arm64/.test(zip) ? [] : ["-x86_64"];
    const runnable = arch.length === 0 || spawnSync("arch", ["-x86_64", "/usr/bin/true"]).status === 0;
    if (!runnable) { console.log("  lancement sauté : Rosetta absent sur ce Mac"); continue; }
    const child = arch.length ? spawn("arch", [...arch, bin], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" } })
      : spawn(bin, [], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" } });
    let log = "";
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    let exited = null;
    child.on("exit", (c, s) => (exited = { c, s }));
    await sleep(20000);
    spawnSync("screencapture", ["-x", path.join(shots, path.basename(zip, ".zip") + ".png")]);
    if (exited) fail(`l'appli s'est fermée toute seule (code ${exited.c}, signal ${exited.s})\n${log.slice(-3000)}`);
    else console.log("  lancement : toujours ouverte après 20 s");
    if (/FATAL|Segmentation|crash/i.test(log)) console.log(`  journal :\n${log.slice(-2000)}`);
    child.kill("SIGTERM");
    await sleep(1500);
    spawnSync("pkill", ["-f", app]);
  }
  console.log(failed ? "\nDes tests Mac ont échoué." : "\nTous les tests Mac sont bons.");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
