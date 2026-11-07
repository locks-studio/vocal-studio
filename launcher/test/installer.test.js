// Installation, réparation, mise à jour et refus d'un fichier abîmé, avec une vraie archive et un faux catalogue
const assert = require("assert");
const crypto = require("crypto"), fs = require("fs"), os = require("os"), path = require("path");
const { Installer, PLATFORM } = require("../src/installer.js");

// Petite archive zip sans compression
function crc32(b) { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return ~c >>> 0; }
function zip(name, text) {
  const data = Buffer.from(text), n = Buffer.from(name), crc = crc32(data);
  const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt32LE(crc, 14); head.writeUInt32LE(data.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(n.length, 26);
  const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(n.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + n.length, 12); end.writeUInt32LE(30 + n.length + data.length, 16);
  return Buffer.concat([head, n, data, cen, n, end]);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "installer-test-"));
function release(version, text, badHash) {
  const f = path.join(tmp, `${version}.zip`), buf = zip("app.txt", text);
  fs.writeFileSync(f, buf);
  const url = "file:///" + f.split(path.sep).join("/").replace(/^\//, "");
  return { id: "demo", name: "Démo", version, downloads: { [PLATFORM]: { url, size: buf.length, sha256: badHash ? "0".repeat(64) : crypto.createHash("sha256").update(buf).digest("hex"), exec: "app.txt" } } };
}
(async () => {
  const ins = new Installer(path.join(tmp, "data"));
  const phases = [];
  let s = await ins.install(release("1.0.0", "un"), (p) => phases.push(p.phase));
  assert.deepEqual([...new Set(phases)], ["download", "verify", "extract", "done"]);
  assert.equal(fs.readFileSync(s.exec, "utf8"), "un");
  // Réparation : même version, fichiers remis à neuf
  fs.writeFileSync(s.exec, "abîmé");
  s = await ins.install(release("1.0.0", "un"), () => {});
  assert.equal(fs.readFileSync(s.exec, "utf8"), "un");
  assert(!fs.existsSync(s.dir + ".old"), "pas de dossier écarté qui traîne");
  // Mise à jour : l'ancienne version disparaît
  const old = s.dir;
  s = await ins.install(release("1.1.0", "deux"), () => {});
  assert.equal(fs.readFileSync(s.exec, "utf8"), "deux");
  assert(!fs.existsSync(old));
  // Fichier abîmé : refusé, et la version en place reste intacte
  await assert.rejects(ins.install(release("1.2.0", "trois", true), () => {}), /abîmé/);
  assert.equal(ins.installed("demo").version, "1.1.0");
  assert.equal(fs.readFileSync(ins.installed("demo").exec, "utf8"), "deux");
  // Reste d'une ancienne version : nettoyé au démarrage suivant
  fs.mkdirSync(path.join(ins.appsDir, "demo", "0.9.0"), { recursive: true });
  new Installer(ins.root);
  assert(!fs.existsSync(path.join(ins.appsDir, "demo", "0.9.0")));
  // Fichiers disparus : message clair au lancement
  fs.rmSync(s.exec);
  assert.throws(() => ins.launch("demo"), /Réparer/);
  ins.uninstall("demo");
  assert.equal(ins.installed("demo"), null);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("installeur : tous les tests passent");
})().catch((e) => { console.error(e); process.exit(1); });
