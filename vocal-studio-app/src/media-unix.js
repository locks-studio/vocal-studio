// « Ce PC » sous Linux et Mac : la musique qui joue sur l'ordinateur, sans rien à connecter.
// - Linux : MPRIS, le standard que tous les lecteurs suivent (Spotify, Deezer via navigateur, Firefox, Chromium,
//   VLC, mpv, Rhythmbox…). Lu avec « playerctl » s'il est installé, sinon avec « gdbus » (fourni avec glib2).
// - Mac : les applis Spotify et Musique, via AppleScript (les autres lecteurs n'exposent rien d'officiel).
// Envoie le même format que le script Windows : { app, title, artist, cover, duration, progress, updated, playing }.
const { execFile } = require("child_process");
const fs = require("fs");

const run = (cmd, args, timeout = 2500) => new Promise((resolve) => {
  execFile(cmd, args, { timeout, maxBuffer: 1 << 20 }, (err, out) => resolve(err ? null : String(out)));
});

// ——— Linux ———
// Texte « GVariant » de gdbus : 'clé': <'valeur'> ou <"valeur"> (guillemets doubles s'il y a une apostrophe)
const gv = {
  str(txt, key) {
    const m = new RegExp(`'${key}': <(?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)")>`).exec(txt);
    return m ? (m[1] ?? m[2]).replace(/\\(.)/g, "$1") : "";
  },
  list(txt, key) {
    const m = new RegExp(`'${key}': <\\[(.*?)\\]>`).exec(txt);
    if (!m) return gv.str(txt, key);
    return [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)].map((x) => (x[1] ?? x[2]).replace(/\\(.)/g, "$1")).join(", ");
  },
  num(txt, key) {
    const m = new RegExp(`'${key}': <(?:u?int64 |int32 |uint32 |double )?(-?[\\d.]+)>`).exec(txt);
    return m ? Number(m[1]) : 0;
  },
};

class LinuxMedia {
  constructor() { this.tool = null; this.last = null; }

  async detect() {
    if (this.tool) return this.tool;
    if (await run("playerctl", ["--version"])) this.tool = "playerctl";
    else if (await run("gdbus", ["help"])) this.tool = "gdbus";
    return this.tool;
  }

  // Tous les lecteurs ouverts, avec leur état
  async players() {
    if (this.tool === "playerctl") {
      const fmt = "{{playerName}}\t{{status}}\t{{xesam:title}}\t{{xesam:artist}}\t{{mpris:artUrl}}\t{{mpris:length}}\t{{position}}";
      const out = await run("playerctl", ["-a", "metadata", "--format", fmt]);
      if (!out) return [];
      return out.split("\n").filter(Boolean).map((l) => {
        const [name, status, title, artist, art, len, pos] = l.split("\t");
        return { name, playing: status === "Playing", title, artist, art, duration: Number(len) / 1000 || 0, progress: Number(pos) / 1000 || 0 };
      });
    }
    const names = await run("gdbus", ["call", "--session", "--dest", "org.freedesktop.DBus", "--object-path", "/org/freedesktop/DBus", "--method", "org.freedesktop.DBus.ListNames"]);
    if (!names) return [];
    const list = [...names.matchAll(/'(org\.mpris\.MediaPlayer2\.[^']+)'/g)].map((m) => m[1]);
    const all = await Promise.all(list.map(async (dest) => {
      const t = await run("gdbus", ["call", "--session", "--dest", dest, "--object-path", "/org/mpris/MediaPlayer2", "--method", "org.freedesktop.DBus.Properties.GetAll", "org.mpris.MediaPlayer2.Player"]);
      if (!t) return null;
      return {
        name: dest.replace("org.mpris.MediaPlayer2.", ""), dest,
        playing: gv.str(t, "PlaybackStatus") === "Playing",
        title: gv.str(t, "xesam:title"), artist: gv.list(t, "xesam:artist"), art: gv.str(t, "mpris:artUrl"),
        duration: gv.num(t, "mpris:length") / 1000, progress: gv.num(t, "Position") / 1000,
      };
    }));
    return all.filter(Boolean);
  }

  // Le lecteur à afficher : celui qui joue (Deezer et Spotify d'abord), sinon le dernier affiché
  async read() {
    if (!(await this.detect())) return { error: "Pour « Ce PC » sous Linux, installe « playerctl » (ou glib2 pour gdbus)." };
    const ps = (await this.players()).filter((p) => p.title);
    const rank = (p) => (p.playing ? 0 : 2) + (/deezer|spotify/i.test(p.name) ? 0 : 1);
    ps.sort((a, b) => rank(a) - rank(b));
    const p = ps.find((x) => x.playing) || ps.find((x) => this.last && x.name === this.last) || ps[0];
    if (!p) return { track: null };
    this.last = p.name;
    this.current = p;
    return { track: { app: p.name, title: p.title, artist: p.artist, art: p.art, duration: Math.round(p.duration), progress: Math.round(p.progress), updated: Date.now(), playing: p.playing } };
  }

  async control(cmd) {
    const p = this.current;
    if (!p) return;
    const method = { toggle: "PlayPause", next: "Next", prev: "Previous" }[cmd];
    if (this.tool === "playerctl") await run("playerctl", ["-p", p.name, { toggle: "play-pause", next: "next", prev: "previous" }[cmd]]);
    else await run("gdbus", ["call", "--session", "--dest", p.dest, "--object-path", "/org/mpris/MediaPlayer2", "--method", `org.mpris.MediaPlayer2.Player.${method}`]);
  }
}

// ——— Mac ———
const MAC_APPS = [
  // Spotify : durée en millisecondes, position en secondes, pochette en lien
  { name: "Spotify", script: `if application "Spotify" is running then tell application "Spotify" to return (player state as string) & tab & (name of current track) & tab & (artist of current track) & tab & (duration of current track) & tab & (player position) & tab & (artwork url of current track)`, ms: true },
  // Musique (Apple Music) : durée et position en secondes, pas de lien de pochette (Hush en cherche une en ligne)
  { name: "Music", script: `if application "Music" is running then tell application "Music" to return (player state as string) & tab & (name of current track) & tab & (artist of current track) & tab & (duration of current track) & tab & (player position) & tab & ""`, ms: false },
];
class MacMedia {
  constructor() { this.current = null; }
  async read() {
    const res = [];
    for (const a of MAC_APPS) {
      const out = await run("osascript", ["-e", a.script]);
      if (!out || !out.trim()) continue;
      const [state, title, artist, dur, pos, art] = out.trim().split("\t");
      res.push({ app: a.name, playing: state === "playing", title, artist, art, duration: Math.round(Number(dur) * (a.ms ? 1 : 1000)), progress: Math.round(Number(pos) * 1000) });
    }
    const p = res.find((x) => x.playing) || res[0];
    this.current = p || null;
    if (!p) return { track: null };
    return { track: { ...p, updated: Date.now() } };
  }
  async control(cmd) {
    if (!this.current) return;
    const verb = { toggle: "playpause", next: "next track", prev: "previous track" }[cmd];
    await run("osascript", ["-e", `tell application "${this.current.app}" to ${verb}`]);
  }
}

// ——— Pochettes ———
// L'interface n'affiche que quelques sites d'images (sécurité) : on transforme les autres (fichier local d'un navigateur,
// miniature YouTube…) en image intégrée, gardée en mémoire pour ne pas la relire à chaque seconde.
const covers = new Map();
async function coverOf(url) {
  if (!url) return null;
  if (/^https:\/\/(i\.scdn\.co|cdn-images\.dzcdn\.net|e-cdns-images\.dzcdn\.net|cdn\.discordapp\.com)\//.test(url)) return url;
  if (covers.has(url)) return covers.get(url);
  covers.set(url, null);
  let data = null;
  try {
    if (url.startsWith("file://")) {
      const f = decodeURIComponent(new URL(url).pathname);
      const st = fs.statSync(f);
      if (st.size < 3e6) data = `data:image/${/\.png$/i.test(f) ? "png" : "jpeg"};base64,${fs.readFileSync(f).toString("base64")}`;
    } else if (url.startsWith("https://") || url.startsWith("http://")) {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const buf = Buffer.from(await r.arrayBuffer());
      if (r.ok && buf.length < 3e6) data = `data:${r.headers.get("content-type") || "image/jpeg"};base64,${buf.toString("base64")}`;
    }
  } catch {}
  if (covers.size > 40) covers.delete(covers.keys().next().value);
  covers.set(url, data);
  return data;
}

// Lit la musique chaque seconde et prévient quand elle change
class UnixMedia {
  constructor(onState) {
    this.onState = onState;
    this.reader = process.platform === "darwin" ? new MacMedia() : new LinuxMedia();
    this.timer = null;
    this.lastLine = "";
  }
  start() {
    this.stop();
    const tick = async () => {
      let r;
      try { r = await this.reader.read(); } catch (e) { r = { error: e.message }; }
      if (r.track) r.track.cover = await coverOf(r.track.art);
      // On ne renvoie que si quelque chose a changé (la position avance toute seule dans l'interface)
      const key = JSON.stringify({ ...r, track: r.track && { ...r.track, progress: Math.round(r.track.progress / 3000), updated: 0 } });
      if (key !== this.lastLine) { this.lastLine = key; this.onState(r); }
    };
    tick();
    this.timer = setInterval(tick, 1000);
  }
  stop() { clearInterval(this.timer); this.timer = null; }
  async control(cmd) { await this.reader.control(cmd); this.lastLine = ""; }
}

module.exports = { UnixMedia, gv };
