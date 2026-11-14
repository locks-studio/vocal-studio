/* ——— Lecture de l'aperçu ———
   Chaque bloc audio a son lecteur (le fichier est lu en continu depuis le disque, jamais chargé en entier).
   L'horloge de référence est celle de la carte son : les lecteurs sont recalés dessus s'ils dérivent.
   (L'export, lui, mélange les pistes avec ffmpeg, à l'échantillon près.) */
const Player = {
  ctx: null,
  playing: false,
  base: 0,      // position (s) au moment du dernier départ / saut
  baseCtx: 0,   // heure de la carte son à ce moment-là
  els: new Map(), // id du bloc → { el, gain, file }
  mutedRows: new Set(),
  soloRow: null,
};

function audioCtx() {
  if (!Player.ctx) Player.ctx = new AudioContext({ latencyHint: "interactive" });
  return Player.ctx;
}
function now() {
  if (!Player.playing) return Player.base;
  return Player.base + (Player.ctx.currentTime - Player.baseCtx);
}
function seek(t) {
  t = Math.max(0, Math.min(t, duration()));
  Player.base = t;
  if (Player.ctx) Player.baseCtx = Player.ctx.currentTime;
  for (const e of Player.els.values()) e.sync = true;
  if (window.onSeek) window.onSeek();
}
function play() {
  if (Player.playing) return;
  const ctx = audioCtx();
  ctx.resume();
  if (Player.base >= duration() - 0.05) Player.base = 0;
  Player.baseCtx = ctx.currentTime;
  Player.playing = true;
  for (const e of Player.els.values()) e.sync = true;
  $("#bPlay").textContent = "❚❚";
}
function pause() {
  if (!Player.playing) return;
  Player.base = now();
  Player.playing = false;
  for (const e of Player.els.values()) if (!e.el.paused) e.el.pause();
  $("#bPlay").textContent = "▶";
}
const toggle = () => (Player.playing ? pause() : play());

function rowGain(row) {
  if (Player.soloRow && Player.soloRow !== row) return 0;
  if (Player.mutedRows.has(row)) return 0;
  const p = person(row);
  return p ? p.vol : 1;
}

function playerFor(c) {
  let e = Player.els.get(c.id);
  if (e && e.file !== c.file) { e.el.pause(); e.el.removeAttribute("src"); Player.els.delete(c.id); e = null; }
  if (!e) {
    const el = new Audio();
    el.preload = "auto";
    el.src = fileUrl(c.file);
    const ctx = audioCtx();
    const src = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    src.connect(gain).connect(ctx.destination);
    e = { el, gain, file: c.file, sync: true };
    Player.els.set(c.id, e);
  }
  return e;
}

// Appelé à chaque image : démarre, arrête et recale les lecteurs selon la position
function tickPlayer() {
  const t = now();
  if (Player.playing && t >= duration()) { pause(); seek(duration()); }
  const live = new Set();
  for (const c of P.clips) {
    if (c.kind !== "audio") continue;
    live.add(c.id);
    const active = Player.playing && t >= c.start && t < c.start + c.dur;
    const e = Player.els.get(c.id) || (active ? playerFor(c) : null);
    if (!e) continue;
    e.gain.gain.value = rowGain(c.row) * (c.gain ?? 1);
    if (!active) { if (!e.el.paused) e.el.pause(); e.sync = true; continue; }
    const want = t - c.start + c.in;
    if (e.sync || Math.abs(e.el.currentTime - want) > 0.12) {
      e.el.currentTime = want;
      e.sync = false;
    }
    if (e.el.paused) e.el.play().catch(() => {});
  }
  // Blocs supprimés : on libère leur lecteur
  for (const [id, e] of Player.els) if (!live.has(id)) { e.el.pause(); e.el.removeAttribute("src"); Player.els.delete(id); }
}
