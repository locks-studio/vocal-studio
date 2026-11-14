// Export : la page de Hush tourne avec une HORLOGE MAÎTRISÉE. Le temps n'avance que quand Hush Studio le
// demande (1/60 s par image), quelle que soit la vitesse du PC. Résultat : une vidéo parfaitement fluide,
// identique d'un export à l'autre.
// Ce preload tourne dans le même monde que la page (contextIsolation: false) pour remplacer, avant que Hush
// ne démarre : performance.now, Date.now, requestAnimationFrame, setTimeout/setInterval et Math.random.
// Les animations CSS sont mises en pause et placées à la main sur cette horloge à chaque image.
const { ipcRenderer } = require("electron");
const { makeStudio, prepareSettings } = require("./fake-studio");

prepareSettings();

const realRAF = window.requestAnimationFrame.bind(window);
const realSetTimeout = window.setTimeout.bind(window);
const realDateNow = Date.now.bind(Date);
const T0 = realDateNow();
let vt = 0; // temps virtuel, en millisecondes

performance.now = () => vt;
Date.now = () => T0 + vt;

// Hasard reproductible : même caméra et mêmes effets à chaque export
let seed = 0x9e3779b9;
Math.random = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const rafs = new Map();
let rafId = 0;
window.requestAnimationFrame = (cb) => { const id = ++rafId; rafs.set(id, cb); return id; };
window.cancelAnimationFrame = (id) => { rafs.delete(id); };

const timers = new Map();
let timerId = 0;
const addTimer = (fn, ms, args, every) => {
  const id = ++timerId;
  timers.set(id, { at: vt + Math.max(0, +ms || 0), fn, args, every });
  return id;
};
window.setTimeout = (fn, ms, ...args) => addTimer(fn, ms, args, null);
window.setInterval = (fn, ms, ...args) => addTimer(fn, ms, args, Math.max(1, +ms || 0));
window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };

function runTimersUntil(target) {
  for (let guard = 0; guard < 10000; guard++) {
    let next = null;
    for (const [id, t] of timers) if (t.at <= target && (!next || t.at < next[1].at)) next = [id, t];
    if (!next) break;
    const [id, t] = next;
    vt = Math.max(vt, t.at);
    if (t.every) t.at += t.every; else timers.delete(id);
    try { typeof t.fn === "function" ? t.fn(...t.args) : null; } catch (e) { console.error(e); }
  }
}

// Animations CSS : chacune démarre sur l'horloge virtuelle au moment où on la découvre
const animStart = new WeakMap();
function syncAnimations() {
  for (const a of document.getAnimations()) {
    let st = animStart.get(a);
    if (st === undefined) { st = vt; animStart.set(a, st); try { a.pause(); } catch {} }
    try { a.currentTime = vt - st; } catch {}
  }
}

function step(dt) {
  const target = vt + dt;
  runTimersUntil(target);
  vt = target;
  const cbs = [...rafs.values()];
  rafs.clear();
  for (const cb of cbs) { try { cb(vt); } catch (e) { console.error(e); } }
  syncAnimations();
}

const { api, emit } = makeStudio(ipcRenderer, window);
window.studio = api;

const nextPaint = () => new Promise((r) => realRAF(() => realRAF(r)));
let lookKey = "";
// Une image : (style si changé) → état du vocal → avance de dt ms → attend que l'image soit dessinée
window.__hsFrame = async (state, look, dt) => {
  if (look) {
    const k = JSON.stringify(look);
    if (k !== lookKey) {
      lookKey = k;
      try { applyLook(look); S.vertical = !!look.vertical; apply(); layout(); } catch (e) { console.error(e); }
    }
  }
  if (state) emit(state);
  step(dt);
  return vt;
};
// Attend que les polices et les images (avatars, fond) soient prêtes
window.__hsReady = async () => {
  try { await document.fonts.ready; } catch {}
  const imgs = [...document.images].filter((i) => !i.complete);
  await Promise.all(imgs.map((i) => new Promise((r) => { i.onload = i.onerror = r; realSetTimeout(r, 3000); })));
  await nextPaint();
  return true;
};
