// « Mes sons » : fichiers audio importés dans l'appli, servis à l'interface par le protocole vsmedia://
// + recherche des paroles (fichier .lrc importé, sinon la base libre LRCLIB).
const { protocol, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Readable } = require("stream");
const mm = require("music-metadata");

const AUDIO = ["mp3", "m4a", "aac", "wav", "ogg", "opus", "flac", "webm", "weba", "mp4", "3gp"];
const TYPES = {
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", opus: "audio/ogg",
  flac: "audio/flac", webm: "audio/webm", weba: "audio/webm", mp4: "audio/mp4", "3gp": "audio/3gpp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
};

// À appeler avant que l'application soit prête
function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: "vsmedia", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  ]);
}

class SoundLibrary {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.indexFile = path.join(dir, "index.json");
    try { this.items = JSON.parse(fs.readFileSync(this.indexFile, "utf8")); } catch { this.items = []; }
    this.lyricsCache = new Map();
  }

  save() { fs.writeFileSync(this.indexFile, JSON.stringify(this.items, null, 2)); }
  // ?v= change quand on remplace la pochette, pour que l'interface ne garde pas l'ancienne en cache
  list() { return this.items.map((s) => ({ ...s, url: `vsmedia://sounds/${s.file}`, coverUrl: s.cover ? `vsmedia://sounds/${s.cover}?v=${s.coverV || 0}` : null })); }

  // Sert les fichiers au lecteur, avec les requêtes partielles (Range) pour pouvoir avancer dans le morceau
  serve() {
    protocol.handle("vsmedia", async (req) => {
      const file = path.join(this.dir, path.basename(decodeURIComponent(new URL(req.url).pathname)));
      let st;
      try { st = fs.statSync(file); } catch { return new Response("introuvable", { status: 404 }); }
      const type = TYPES[path.extname(file).slice(1).toLowerCase()] || "application/octet-stream";
      const base = { "Content-Type": type, "Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*" };
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") || "");
      if (!m) {
        return new Response(Readable.toWeb(fs.createReadStream(file)), { status: 200, headers: { ...base, "Content-Length": String(st.size) } });
      }
      const start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2]));
      const end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
      return new Response(Readable.toWeb(fs.createReadStream(file, { start, end })), {
        status: 206,
        headers: { ...base, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${st.size}` },
      });
    });
  }

  // Fenêtre « Ajouter des sons » : fichiers audio, et éventuellement leurs paroles .lrc (même nom)
  async add(win) {
    const r = await dialog.showOpenDialog(win, {
      title: "Ajouter des sons",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Sons et paroles", extensions: [...AUDIO, "lrc"] }],
    });
    if (r.canceled) return this.list();
    const lrcs = new Map(r.filePaths.filter((p) => /\.lrc$/i.test(p)).map((p) => [path.basename(p, path.extname(p)).toLowerCase(), p]));
    for (const src of r.filePaths.filter((p) => !/\.lrc$/i.test(p))) {
      const id = crypto.randomBytes(6).toString("hex");
      const ext = path.extname(src).toLowerCase();
      const base = path.basename(src, ext);
      const item = { id, file: id + ext, title: base, artist: "", duration: 0, cover: null, lrc: null };
      fs.copyFileSync(src, path.join(this.dir, item.file));
      try {
        const meta = await mm.parseFile(src, { duration: true });
        const c = meta.common;
        if (c.title) item.title = c.title;
        if (c.artist) item.artist = c.artist;
        item.duration = Math.round((meta.format.duration || 0) * 1000);
        const pic = c.picture && c.picture[0];
        if (pic) {
          item.cover = `${id}-cover.${/png/.test(pic.format) ? "png" : "jpg"}`;
          fs.writeFileSync(path.join(this.dir, item.cover), pic.data);
        }
      } catch {}
      // Sans tags : « Artiste - Titre » dans le nom du fichier
      if (!item.artist && / - /.test(item.title)) [item.artist, item.title] = item.title.split(/ - (.+)/);
      const lrc = lrcs.get(base.toLowerCase());
      if (lrc) { item.lrc = id + ".lrc"; fs.copyFileSync(lrc, path.join(this.dir, item.lrc)); }
      this.items.push(item);
    }
    this.save();
    return this.list();
  }

  // Ajoute un fichier .lrc à un son déjà importé
  async attachLrc(win, id) {
    const item = this.items.find((s) => s.id === id);
    if (!item) return this.list();
    const r = await dialog.showOpenDialog(win, { title: "Paroles (.lrc)", properties: ["openFile"], filters: [{ name: "Paroles", extensions: ["lrc"] }] });
    if (!r.canceled) {
      item.lrc = id + ".lrc";
      fs.copyFileSync(r.filePaths[0], path.join(this.dir, item.lrc));
      this.lyricsCache.clear();
      this.save();
    }
    return this.list();
  }

  // Pochette choisie à la main pour un son (un enregistrement n'en a pas)
  async setCover(win, id) {
    const item = this.items.find((s) => s.id === id);
    if (!item) return this.list();
    const r = await dialog.showOpenDialog(win, { title: "Pochette", properties: ["openFile"], filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] }] });
    if (!r.canceled) {
      if (item.cover) fs.rmSync(path.join(this.dir, item.cover), { force: true });
      item.cover = `${id}-cover${path.extname(r.filePaths[0]).toLowerCase()}`;
      fs.copyFileSync(r.filePaths[0], path.join(this.dir, item.cover));
      item.coverV = Date.now();
      this.save();
    }
    return this.list();
  }

  // Son enregistré au micro dans l'appli (WebM/Opus)
  addRecording(data, durationMs) {
    const id = crypto.randomBytes(6).toString("hex");
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const item = {
      id, file: id + ".webm", title: `Enregistrement du ${pad(d.getDate())}/${pad(d.getMonth() + 1)} à ${pad(d.getHours())}h${pad(d.getMinutes())}`,
      artist: "", duration: Math.round(durationMs || 0), cover: null, lrc: null,
    };
    fs.writeFileSync(path.join(this.dir, item.file), Buffer.from(data));
    this.items.push(item);
    this.save();
    return this.list();
  }

  rename(id, title) {
    const item = this.items.find((s) => s.id === id);
    const t = String(title || "").trim().slice(0, 80);
    if (item && t) { item.title = t; this.save(); }
    return this.list();
  }

  remove(id) {
    const item = this.items.find((s) => s.id === id);
    if (item) {
      for (const f of [item.file, item.cover, item.lrc]) if (f) fs.rm(path.join(this.dir, f), { force: true }, () => {});
      this.items = this.items.filter((s) => s !== item);
      this.save();
    }
    return this.list();
  }

  // Pochette de secours quand la source n'en donne pas (ex. Opera GX envoie une miniature vide) :
  // recherche dans le catalogue public de Deezer, en n'acceptant que le bon artiste
  async findCover({ title, artist }) {
    const clean = (s) => String(s || "").replace(/\s*[([].*?[)\]]/g, "").replace(/\s+(feat|ft)\..*$/i, "").trim();
    const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    const text = `${clean(artist)} ${clean(title)}`.replace(/ - /g, " ").trim();
    if (!text) return null;
    const key = "cover|" + norm(text);
    if (this.lyricsCache.has(key)) return this.lyricsCache.get(key);
    let url = null;
    try {
      const j = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(text)}&limit=5`).then((r) => r.json());
      const hay = norm(`${artist} ${title}`);
      const hit = (j.data || []).find((x) => x.album && x.album.cover_xl && hay.includes(norm(x.artist && x.artist.name)));
      url = hit ? hit.album.cover_xl : null;
    } catch { return null; } // pas de réseau : on réessaiera au prochain morceau
    this.lyricsCache.set(key, url);
    return url;
  }

  // Paroles : { synced: "[mm:ss.xx] ligne…" | null, plain: string | null, source, error? }
  async lyrics({ title, artist, duration, soundId }) {
    const item = soundId && this.items.find((s) => s.id === soundId);
    if (item && item.lrc) {
      try { return { synced: fs.readFileSync(path.join(this.dir, item.lrc), "utf8"), plain: null, source: "fichier .lrc" }; } catch {}
    }
    if (!title) return { synced: null, plain: null, source: null };
    const key = `${artist}|${title}`.toLowerCase();
    if (this.lyricsCache.has(key)) return this.lyricsCache.get(key);
    // On nettoie « (Official Video) », « [Clip] », « feat. … » qui gênent la recherche
    const clean = (s) => String(s || "").replace(/\s*[([].*?[)\]]/g, "").replace(/\s+(feat|ft)\..*$/i, "").trim();
    const headers = { "User-Agent": "VocalStudio/0.1" };
    try {
      const q = new URLSearchParams({ track_name: clean(title), artist_name: clean(artist) });
      if (duration) q.set("duration", String(Math.round(duration / 1000)));
      let res = await fetch(`https://lrclib.net/api/get?${q}`, { headers });
      let hit = null;
      if (res.ok) hit = await res.json();
      else if (res.status === 404) {
        const s = new URLSearchParams({ track_name: clean(title) });
        if (artist) s.set("artist_name", clean(artist));
        res = await fetch(`https://lrclib.net/api/search?${s}`, { headers });
        if (res.ok) { const list = await res.json(); hit = list.find((x) => x.syncedLyrics) || list[0] || null; }
      }
      if (!res.ok && res.status !== 404) throw new Error(`le service de paroles répond ${res.status}`);
      const out = { synced: hit && hit.syncedLyrics || null, plain: hit && hit.plainLyrics || null, source: "LRCLIB" };
      this.lyricsCache.set(key, out);
      return out;
    } catch (e) {
      return { synced: null, plain: null, source: null, error: `Paroles indisponibles : ${e.message}. Tu peux ajouter un fichier .lrc.` };
    }
  }
}

module.exports = { registerScheme, SoundLibrary };
