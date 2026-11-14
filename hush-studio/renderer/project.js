/* ——— Le projet : personnes, blocs audio, scènes visuelles ———
   Personne : { id, name, avatar (image en data:), discordId, color, vol (volume du son), sens (sensibilité de l'anneau) }
   Bloc     : { id, row (id de la personne, ou "sons"), kind ("audio" | "talk"), file, name, start, in, dur, srcDur, gain }
              « talk » = passage de parole dessiné à la main (audio mélangé) : la personne s'anime sans fichier.
   Scène    : { id, start, look } — look = réglages visuels de Hush (mêmes clés que ses préréglages)
   Tous les temps sont en secondes. */
const $ = (s) => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
const COLORS = ["#fcbbdd", "#7cc8ff", "#9dff8a", "#ffc46b", "#c9a0ff", "#ff8a8a", "#6bffd8", "#ffe36b", "#ff9de2", "#a0b4ff"];
const SONS = "sons";

function newProject() {
  return { v: 1, name: "Mon vocal", format: "16:9", people: [], clips: [], scenes: [{ id: uid(), start: 0, look: {} }] };
}

let P = newProject();
let projectFile = null;
let dirty = false;
const ENV = new Map(); // fichier → { step, lvl (Uint8Array), duration } : courbes de volume
const Sel = { kind: null, id: null }; // ce qui est sélectionné (person | clip | scene | null)

const person = (id) => P.people.find((p) => p.id === id);
const clip = (id) => P.clips.find((c) => c.id === id);
const scene = (id) => P.scenes.find((s) => s.id === id);
const clipsOf = (row) => P.clips.filter((c) => c.row === row);
const duration = () => Math.max(10, ...P.clips.map((c) => c.start + c.dur));
const sortScenes = () => P.scenes.sort((a, b) => a.start - b.start);
const sceneAt = (t) => { let s = P.scenes[0]; for (const x of P.scenes) if (x.start <= t + 1e-6) s = x; return s; };

function addPerson(fields = {}) {
  const p = { id: uid(), name: fields.name || `Personne ${P.people.length + 1}`, avatar: null, discordId: null, color: COLORS[P.people.length % COLORS.length], vol: 1, sens: 1, ...fields };
  P.people.push(p);
  return p;
}

/* — Annuler / Rétablir : on garde des copies du projet (il est léger : les sons restent dans leurs fichiers) — */
const History = { undo: [], redo: [], pending: null };
function snapshot() { return JSON.stringify(P); }
// À appeler AVANT une modification
function checkpoint() {
  History.undo.push(snapshot());
  if (History.undo.length > 200) History.undo.shift();
  History.redo = [];
  markDirty();
}
// Pour un glisser : une seule étape d'annulation pour tout le geste
function beginGesture() { History.pending = snapshot(); }
function endGesture() {
  if (History.pending && History.pending !== snapshot()) {
    History.undo.push(History.pending);
    History.redo = [];
    markDirty();
  }
  History.pending = null;
}
function undo() {
  if (!History.undo.length) return;
  History.redo.push(snapshot());
  P = JSON.parse(History.undo.pop());
  afterLoad();
  markDirty();
}
function redo() {
  if (!History.redo.length) return;
  History.undo.push(snapshot());
  P = JSON.parse(History.redo.pop());
  afterLoad();
  markDirty();
}

let autosaveT = null;
function markDirty() {
  dirty = true;
  clearTimeout(autosaveT);
  autosaveT = setTimeout(() => window.hs.autosave({ project: P, file: projectFile }), 1500);
  if (window.onProjectChange) window.onProjectChange();
}

// Courbe de volume décodée (base64 → octets 0..255)
function storeEnv(file, r) {
  const bin = atob(r.lvl);
  const lvl = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) lvl[i] = bin.charCodeAt(i);
  ENV.set(file, { step: r.step, lvl, duration: r.duration });
}

const fmt = (t, cs = true) => {
  t = Math.max(0, t);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
  const c = cs ? "." + String(Math.floor((t % 1) * 100)).padStart(2, "0") : "";
  return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(s).padStart(2, "0")}` + c;
};
const fileUrl = (f) => "file:///" + f.replace(/\\/g, "/").split("/").map((x, i) => (i === 0 && /^[A-Za-z]:$/.test(x) ? x : encodeURIComponent(x))).join("/").replace(/^\/+/, "");
const baseName = (f) => f.split(/[\\/]/).pop();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function toast(msg, ms = 3200) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), ms);
}
