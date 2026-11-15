// Import d'un enregistrement Craig (zip) : une piste par personne, avec le pseudo et l'ID Discord de info.txt.
// Les pistes sont extraites une seule fois dans le dossier de l'appli (le zip peut ensuite être supprimé).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
// yauzl est chargé seulement à l'import (les tests de readInfo tournent sans les modules installés)

const AUDIO = /\.(flac|wav|mp3|ogg|opus|m4a|aac|aiff?)$/i;
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;

function readInfo(txt) {
  // « Tracks: » puis une ligne par personne : « pseudo#0 (123456789012345678) »
  const tracks = [];
  const part = txt.split(/^Tracks:\s*$/m)[1] || "";
  for (const line of part.split(/\r?\n/)) {
    const m = /^\s+(.+?)#(\d+)\s*\((\d{15,22})\)/.exec(line);
    if (m) tracks.push({ name: m[1], discordId: m[3] });
  }
  const start = /Start time:\s*(\S+)/.exec(txt);
  const chan = /Channel:\s*(.+?)\s*\(\d+\)/.exec(txt);
  return { tracks, start: start ? start[1] : null, channel: chan ? chan[1] : null };
}

function importZip(zipFile, root) {
  const st = fs.statSync(zipFile);
  const id = crypto.createHash("sha1").update(`${path.resolve(zipFile)}|${st.size}|${st.mtimeMs}`).digest("hex").slice(0, 12);
  const dir = path.join(root, `${path.basename(zipFile, ".zip").slice(0, 40)}-${id}`);
  fs.mkdirSync(dir, { recursive: true });
  return new Promise((resolve, reject) => {
    require("yauzl").open(zipFile, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(new Error("zip illisible"));
      const got = [], avatars = [];
      let info = "";
      zip.on("entry", (e) => {
        const base = path.basename(e.fileName);
        // Rien en dehors du dossier d'import, et seulement l'audio et info.txt (raw.dat ne sert pas)
        if (/\/$/.test(e.fileName) || !(AUDIO.test(base) || IMAGE.test(base) || base === "info.txt")) return zip.readEntry();
        // Photo de profil (zip « avatars » de Craig : « 1-pseudo.png ») : gardée en mémoire, pas extraite
        if (IMAGE.test(base)) {
          if (e.uncompressedSize > 15e6) return zip.readEntry();
          return zip.openReadStream(e, (er, rs) => {
            if (er) return reject(er);
            const parts = [];
            rs.on("data", (d) => parts.push(d));
            rs.on("end", () => {
              const ext = path.extname(base).slice(1).toLowerCase().replace("jpg", "jpeg");
              const m = /^(\d+)-(.+)$/.exec(base.replace(/\.[^.]+$/, ""));
              avatars.push({ n: m ? +m[1] : null, name: m ? m[2] : base.replace(/\.[^.]+$/, ""), data: `data:image/${ext};base64,${Buffer.concat(parts).toString("base64")}` });
              zip.readEntry();
            });
          });
        }
        const dest = path.join(dir, base);
        if (base !== "info.txt" && fs.existsSync(dest) && fs.statSync(dest).size === e.uncompressedSize) { got.push(dest); return zip.readEntry(); }
        zip.openReadStream(e, (er, rs) => {
          if (er) return reject(er);
          if (base === "info.txt") {
            const parts = [];
            rs.on("data", (d) => parts.push(d));
            rs.on("end", () => { info = Buffer.concat(parts).toString("utf8"); zip.readEntry(); });
            return;
          }
          const tmp = dest + ".part";
          const ws = fs.createWriteStream(tmp);
          rs.pipe(ws);
          ws.on("finish", () => { fs.renameSync(tmp, dest); got.push(dest); zip.readEntry(); });
          ws.on("error", reject);
        });
      });
      zip.on("end", () => {
        const meta = info ? readInfo(info) : { tracks: [] };
        // Fichiers Craig : « 1-pseudo.flac », dans l'ordre de info.txt
        const sorted = got.sort((a, b) => (parseInt(path.basename(a)) || 0) - (parseInt(path.basename(b)) || 0));
        const people = [], files = [];
        for (const f of sorted) {
          const m = /^(\d+)-(.+)\.[^.]+$/.exec(path.basename(f));
          if (m && meta.tracks.length) {
            const t = meta.tracks[+m[1] - 1] || {};
            people.push({ name: t.name || m[2], discordId: t.discordId || null, file: f });
          } else if (m) people.push({ name: m[2], discordId: null, file: f });
          else files.push({ file: f, name: path.basename(f).replace(/\.[^.]+$/, "") });
        }
        // Photo n° N = piste n° N de info.txt (même ordre chez Craig) : on lui donne aussi l'ID Discord
        for (const a of avatars) { const t = a.n && meta.tracks[a.n - 1]; if (t && t.discordId) a.discordId = t.discordId; }
        resolve({ people, files, avatars, info: { channel: meta.channel, start: meta.start } });
      });
      zip.readEntry();
    });
  });
}

module.exports = { importZip, readInfo };
