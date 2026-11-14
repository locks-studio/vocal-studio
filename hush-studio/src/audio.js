// Analyse du son avec ffmpeg : on ne garde que la courbe de volume (quelques centaines de Ko pour 2 h),
// jamais le son décodé en mémoire.
// Même mesure que le bot 1999 (vocal-studio-bot/src/bot.js) pour que la scène réagisse comme en direct :
// RMS en dB par tranche de 20 ms, -55 dB → 0, -10 dB → 1, puis lissage 0,6 / 0,4.
const { spawn } = require("child_process");

const ffmpegPath = () => require("ffmpeg-static").replace("app.asar", "app.asar.unpacked");

const RATE = 16000;
const STEP = 0.02; // 20 ms : la taille d'un paquet de voix Discord
const WIN = RATE * STEP;

const parseDuration = (txt) => {
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(txt);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
};

function analyze(file, onProgress) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), ["-hide_banner", "-nostdin", "-i", file, "-vn", "-ac", "1", "-ar", String(RATE), "-f", "s16le", "-"], { windowsHide: true });
    let err = "", duration = 0, acc = 0, n = 0, smooth = 0, frames = 0, lastPct = -1;
    let rest = Buffer.alloc(0);
    let lvl = new Uint8Array(1 << 16);
    const push = (v) => {
      if (frames >= lvl.length) { const b = new Uint8Array(lvl.length * 2); b.set(lvl); lvl = b; }
      lvl[frames++] = v;
    };
    p.stderr.on("data", (d) => { if (!duration) { err += d; duration = parseDuration(err); if (err.length > 20000) err = err.slice(-4000); } else err = (err + d).slice(-4000); });
    p.stdout.on("data", (chunk) => {
      const b = rest.length ? Buffer.concat([rest, chunk]) : chunk;
      const len = b.length - (b.length % 2);
      for (let i = 0; i < len; i += 2) {
        const v = b.readInt16LE(i) / 32768;
        acc += v * v;
        if (++n === WIN) {
          const db = 10 * Math.log10(acc / n + 1e-12);
          const raw = Math.max(0, Math.min(1, (db + 55) / 45));
          smooth = smooth * 0.6 + raw * 0.4;
          push(Math.round(smooth * 255));
          acc = 0; n = 0;
        }
      }
      rest = b.subarray(len);
      if (duration && onProgress) {
        const pct = Math.min(99, Math.floor((frames * STEP * 100) / duration));
        if (pct !== lastPct) { lastPct = pct; onProgress(pct); }
      }
    });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code !== 0 && !frames) return reject(new Error("Fichier illisible : " + (err.trim().split("\n").pop() || "erreur ffmpeg")));
      resolve({ duration: frames * STEP, step: STEP, lvl: Buffer.from(lvl.subarray(0, frames)).toString("base64") });
    });
  });
}

// Durée seule (rapide : ffmpeg lit l'en-tête puis s'arrête)
function probe(file) {
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath(), ["-hide_banner", "-nostdin", "-i", file], { windowsHide: true });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", () => resolve({ duration: parseDuration(err) }));
    p.on("error", () => resolve({ duration: 0 }));
  });
}

module.exports = { analyze, probe, ffmpegPath, STEP };
