// Le faux « window.studio » que la page de Hush attend (Discord, musique, fenêtre…).
// Le vocal vient de Hush Studio ; tout le reste répond « rien » sans jamais rien envoyer sur internet.
// Utilisé par l'aperçu (scene-preload.js) et par l'export (export-preload.js).
function makeStudio(ipcRenderer, timers = globalThis) {
  let state = { status: "connecting", mode: "bot", me: null, channel: null, members: [], settings: { mute: false, deaf: false } };
  const listeners = [];
  const emit = (s) => { state = s; for (const fn of listeners) fn(s); };
  const ok = (v) => () => Promise.resolve(v);
  const none = () => {};
  const api = {
    config: { get: ok({ mode: "bot" }), save: ok(true), logout: ok(true) },
    bot: { login: ok(null), info: ok(null) },
    voice: {
      start: () => { timers.setTimeout(() => listeners.forEach((fn) => fn(state)), 0); return Promise.resolve(true); },
      stop: ok(true), state: () => Promise.resolve(state), mute: ok(true), deaf: ok(true), leave: ok(true), summon: ok(true),
      join: ok(true), user: ok(null), home: ok(null), openChannel: ok(true), openProfile: ok(true), copy: ok(true),
      onState: (fn) => { listeners.push(fn); },
    },
    music: { source: ok(true), volume: ok(true), control: ok(true), onState: none },
    sounds: { list: ok([]), add: ok([]), attachLrc: ok(null), remove: ok([]), setCover: ok(null), record: ok(null), rename: ok(null) },
    bg: { pick: ok(null) },
    lyrics: { get: ok(null) },
    cover: { find: ok(null) },
    spotify: { get: ok({ clientId: "", connected: false, redirect: "" }), save: ok(null), login: ok(null), logout: ok(null) },
    capture: { sources: ok([]), pick: ok(null) },
    clip: { begin: ok(null), chunk: ok(null), end: ok(null), show: ok(null) },
    report: { error: (r) => { try { ipcRenderer.sendToHost("scene:error", r); } catch { ipcRenderer.send("scene:error", r); } }, consent: none, copy: ok(null) },
    admin: ok(null),
    account: { remove: ok(null), privacy: ok(null) },
    friends: { op: ok([]), presence: none, onChanged: none },
    chat: { history: ok([]), send: ok(null), onMessage: none },
    usage: { me: ok(null), top: ok([]) },
    linux: { info: ok({}), setMode: ok(null) },
    win: {
      minimize: ok(null), maximize: ok(null), close: ok(null), reload: ok(null), pin: ok(null), fullscreen: ok(null), mini: ok(false),
      drag: none, focusMain: ok(null), onMini: none, overlay: ok(null), screens: ok([]),
    },
  };
  return { api, emit };
}

// Réglages de départ de la scène : pas d'accueil, pas de panneau, pas de tutoriel, rendu en pleine qualité
function prepareSettings() {
  try {
    const base = JSON.parse(localStorage.getItem("vocal-studio") || "{}");
    localStorage.setItem("vocal-studio", JSON.stringify({ ...base, demo: false, panel: false, onboarded: true, musicOn: false, autoHide: true, perf: "max", players: 99, reports: false, hiddenUsers: [] }));
  } catch {}
}

module.exports = { makeStudio, prepareSettings };
