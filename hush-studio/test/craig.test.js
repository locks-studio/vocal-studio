// Tests de Hush Studio : lecture de info.txt de Craig, et mesure du volume (même échelle que le bot 1999).
// Lancement : node hush-studio/test/craig.test.js (tools/check.js le lance avant chaque version)
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { readInfo } = require("../src/craig");

// 1. info.txt de Craig : pseudo, ID Discord, salon, heure de début
const info = readInfo(`Recording AbC123

Guild:\t\tMon serveur (111111111111111111)
Channel:\t༄🔊-Salon-🔊༄ (222222222222222222)
Requester:\tlocks#0 (333333333333333333)
Start time:\t2026-11-13T23:12:37.022Z

Tracks:
\tlocks#0 (333333333333333333)
\timo_99#0 (444444444444444444)
`);
assert.deepStrictEqual(info.tracks, [{ name: "locks", discordId: "333333333333333333" }, { name: "imo_99", discordId: "444444444444444444" }]);
assert.strictEqual(info.channel, "༄🔊-Salon-🔊༄");
assert.strictEqual(info.start, "2026-11-13T23:12:37.022Z");
assert.deepStrictEqual(readInfo("rien d'utile").tracks, []);

// 2. Mesure du volume : 1 s de silence puis 1 s de son fort → 0 au début, proche de 1 à la fin
let ffmpeg = null;
try { ffmpeg = require("ffmpeg-static"); } catch {}
if (!ffmpeg || !fs.existsSync(ffmpeg)) {
  console.log("craig.test.js : OK (mesure du volume sautée : ffmpeg pas installé, lance npm install dans hush-studio)");
  process.exit(0);
}
const { analyze } = require("../src/audio");
const wav = path.join(os.tmpdir(), `hs-test-${process.pid}.wav`);
const rate = 16000, n = rate * 2;
const data = Buffer.alloc(n * 2);
for (let i = rate; i < n; i++) data.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 220) * 20000), i * 2);
const head = Buffer.alloc(44);
head.write("RIFF", 0); head.writeUInt32LE(36 + data.length, 4); head.write("WAVE", 8); head.write("fmt ", 12);
head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(rate, 24);
head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write("data", 36); head.writeUInt32LE(data.length, 40);
fs.writeFileSync(wav, Buffer.concat([head, data]));
analyze(wav).then((r) => {
  fs.unlinkSync(wav);
  const lvl = Buffer.from(r.lvl, "base64");
  assert.ok(Math.abs(r.duration - 2) < 0.05, `durée ${r.duration}`);
  assert.strictEqual(r.step, 0.02);
  assert.ok(lvl[25] === 0, `silence mesuré à ${lvl[25]}`);
  assert.ok(lvl[90] > 200, `son fort mesuré à ${lvl[90]} seulement`);
  console.log("craig.test.js : OK");
}).catch((e) => { console.error(e); process.exit(1); });
