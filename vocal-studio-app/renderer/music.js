// Lecteur « Mes sons », carte musique façon lecteur vinyle (toujours en bas à droite) et mode Paroles.
// Chargé avant app.js : les fonctions ici n'utilisent S, $ et le reste qu'au moment où on les appelle.

/* ——— Lecteur « Mes sons » ——— */
const Sounds = { list: [], index: -1, audio: null, ctx: null, analyser: null, data: null };

function soundsAudio() {
  if (Sounds.audio) return Sounds.audio;
  const a = new Audio();
  a.crossOrigin = "anonymous"; // nécessaire pour analyser le son (onde, flashs)
  a.preload = "metadata";
  a.addEventListener("ended", () => nextSound(1));
  a.addEventListener("play", () => { updateMusicCard(); renderSoundList(); });
  a.addEventListener("pause", () => { updateMusicCard(); renderSoundList(); });
  a.addEventListener("loadedmetadata", () => updateMusicCard());
  Sounds.audio = a;
  return a;
}

// L'analyse du son ne peut démarrer qu'après un clic (règle des navigateurs)
function ensureAnalyser() {
  if (Sounds.ctx) { Sounds.ctx.resume(); return; }
  try {
    const ctx = new AudioContext();
    const src = ctx.createMediaElementSource(soundsAudio());
    const an = ctx.createAnalyser();
    an.fftSize = 256;
    an.smoothingTimeConstant = 0.75;
    src.connect(an);
    an.connect(ctx.destination);
    Object.assign(Sounds, { ctx, analyser: an, data: new Uint8Array(an.frequencyBinCount) });
  } catch {}
}

async function loadSounds() {
  Sounds.list = await window.studio.sounds.list();
  if (Sounds.index >= Sounds.list.length) Sounds.index = -1;
  renderSoundList();
  updateMusicCard();
}

function playSound(i) {
  const s = Sounds.list[i];
  if (!s) return;
  const a = soundsAudio();
  ensureAnalyser();
  if (Sounds.index !== i) { Sounds.index = i; a.src = s.url; }
  a.volume = S.volume;
  a.play().catch(() => {});
  renderSoundList();
  updateMusicCard();
}

function togglePlay() {
  if (S.musicSource !== "files") return;
  const a = soundsAudio();
  if (Sounds.index < 0) return playSound(0);
  if (a.paused) { ensureAnalyser(); a.play().catch(() => {}); } else a.pause();
}

function nextSound(dir) {
  if (!Sounds.list.length) return;
  const a = soundsAudio();
  // « Précédent » au milieu d'un morceau : on revient d'abord à son début
  if (dir < 0 && a.currentTime > 3) { a.currentTime = 0; return; }
  playSound((Math.max(0, Sounds.index) + dir + Sounds.list.length) % Sounds.list.length);
}

function stopSounds() { if (Sounds.audio) Sounds.audio.pause(); }

function localTrack() {
  const s = Sounds.list[Sounds.index];
  if (!s) return null;
  const a = soundsAudio();
  return {
    title: s.title, artist: s.artist, cover: s.coverUrl, soundId: s.id,
    duration: (isFinite(a.duration) && a.duration ? a.duration * 1000 : s.duration) || 1,
    progress: a.currentTime * 1000, playing: !a.paused, at: Date.now(),
  };
}

// Niveau sonore 0..1 du morceau joué localement (null si on ne peut pas l'entendre)
function audioLevel() {
  if (!Sounds.analyser || !Sounds.audio || Sounds.audio.paused || S.musicSource !== "files") return null;
  Sounds.analyser.getByteFrequencyData(Sounds.data);
  let sum = 0;
  for (let i = 0; i < 24; i++) sum += Sounds.data[i];
  return sum / (24 * 255);
}

function renderSoundList() {
  const ul = document.querySelector("#soundList");
  if (!ul) return;
  ul.textContent = "";
  if (!Sounds.list.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Aucun son pour l'instant. Ajoute des MP3, M4A, WAV, OGG ou FLAC.";
    ul.appendChild(li);
    return;
  }
  Sounds.list.forEach((s, i) => {
    const li = document.createElement("li");
    const playing = i === Sounds.index && Sounds.audio && !Sounds.audio.paused;
    li.classList.toggle("on", i === Sounds.index);
    const play = document.createElement("button");
    play.className = "snd-play";
    play.setAttribute("aria-label", playing ? `Mettre ${s.title} en pause` : `Jouer ${s.title}`);
    play.textContent = playing ? "❚❚" : "▶";
    play.onclick = () => (i === Sounds.index ? togglePlay() : playSound(i));
    const info = document.createElement("span");
    info.className = "snd-info";
    const t = document.createElement("b"); t.textContent = s.title;
    t.title = "Clique pour renommer";
    t.onclick = () => renameSound(t, s);
    const ar = document.createElement("small"); ar.textContent = [s.artist, s.lrc ? "paroles .lrc" : ""].filter(Boolean).join(" · ");
    info.append(t, ar);
    const cov = document.createElement("button");
    cov.className = "snd-mini";
    cov.title = "Choisir la pochette de ce son";
    cov.textContent = "🖼";
    cov.onclick = async () => { Sounds.list = await window.studio.sounds.setCover(s.id); renderSoundList(); updateMusicCard(); };
    const lrc = document.createElement("button");
    lrc.className = "snd-mini";
    lrc.title = "Ajouter un fichier de paroles (.lrc)";
    lrc.textContent = "♪";
    lrc.onclick = async () => { Sounds.list = await window.studio.sounds.attachLrc(s.id); lyr.key = null; renderSoundList(); };
    const del = document.createElement("button");
    del.className = "snd-mini";
    del.title = "Retirer ce son";
    del.textContent = "✕";
    del.onclick = async () => {
      if (i === Sounds.index) { stopSounds(); Sounds.index = -1; }
      else if (i < Sounds.index) Sounds.index--;
      Sounds.list = await window.studio.sounds.remove(s.id);
      renderSoundList();
      updateMusicCard();
    };
    li.append(play, info, cov, lrc, del);
    ul.appendChild(li);
  });
}

// Renommer un son (pratique pour les enregistrements) : clic sur le titre, Entrée pour valider
function renameSound(el, s) {
  el.contentEditable = "plaintext-only";
  el.focus();
  document.getSelection().selectAllChildren(el);
  const done = async (keep) => {
    el.contentEditable = "false";
    el.onkeydown = el.onblur = null;
    if (keep && el.textContent.trim() && el.textContent.trim() !== s.title) {
      Sounds.list = await window.studio.sounds.rename(s.id, el.textContent);
      updateMusicCard();
    }
    renderSoundList();
  };
  el.onkeydown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); done(true); }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(false); }
  };
  el.onblur = () => done(true);
}

/* ——— Enregistrer un son au micro ——— */
const Rec = { media: null, chunks: [], start: 0, timer: null };
async function toggleRecording() {
  const btn = document.querySelector("#recBtn");
  const label = btn.querySelector("span");
  if (Rec.media) { Rec.media.stop(); return; }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch {
    label.textContent = "Micro refusé ou introuvable";
    setTimeout(() => (label.textContent = "Enregistrer au micro"), 3000);
    return;
  }
  const mr = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 160000 });
  Object.assign(Rec, { media: mr, chunks: [], start: Date.now() });
  mr.ondataavailable = (e) => { if (e.data.size) Rec.chunks.push(e.data); };
  mr.onstop = async () => {
    clearInterval(Rec.timer);
    stream.getTracks().forEach((tr) => tr.stop());
    const duration = Date.now() - Rec.start;
    const blob = new Blob(Rec.chunks, { type: "audio/webm" });
    Rec.media = null;
    btn.classList.remove("on");
    label.textContent = "Enregistrer au micro";
    if (duration < 500) return; // clic par erreur
    Sounds.list = await window.studio.sounds.record(await blob.arrayBuffer(), duration);
    S.musicSource = "files"; S.musicOn = true;
    apply();
    renderSoundList();
  };
  mr.start(250);
  btn.classList.add("on");
  const tick = () => (label.textContent = `Arrêter · ${fmtTime((Date.now() - Rec.start) / 1000)}`);
  tick();
  Rec.timer = setInterval(tick, 250);
}

/* ——— Carte lecteur : couleur tirée de la pochette, fond mosaïque, onde ——— */
let cardCover = undefined, cardColor = vivid(null);
// Couleur du lecteur : celle de la pochette, ou la couleur d'accent de l'ambiance (réglage « Couleur du lecteur »)
function cardLook(cover) {
  const accent = getComputedStyle(document.body).getPropertyValue("--accent").trim();
  const key = (S.playerColor === "accent" ? "accent|" + accent : "cover|" + cover) + "|" + S.playerBg;
  if (key === cardCover) return;
  cardCover = key;
  const apply = (rgb, exact) => {
    const c = vivid(rgb, exact);
    cardColor = c;
    document.querySelector("#music").style.setProperty("--mp-c", `hsl(${c.h} ${c.s}% ${c.l}%)`);
    drawMosaic(c);
  };
  if (S.playerColor === "accent") return apply(cssRgb(accent), true);
  if (!cover) return apply(cssRgb(accent), true); // pas de pochette : la couleur de l'interface
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 16;
      const x = cv.getContext("2d");
      x.drawImage(img, 0, 0, 16, 16);
      const d = x.getImageData(0, 0, 16, 16).data;
      // Moyenne pondérée par la saturation : on veut la couleur marquante, pas le gris
      let r = 0, g = 0, b = 0, w = 0;
      for (let i = 0; i < d.length; i += 4) {
        const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
        const k = 0.05 + (mx - mn) / 255;
        r += d[i] * k; g += d[i + 1] * k; b += d[i + 2] * k; w += k;
      }
      apply([r / w, g / w, b / w]);
    } catch { apply(null); }
  };
  img.onerror = () => apply(null);
  img.src = cover;
}

// Deux couleurs tirées de la pochette pour l'anneau : la dominante et la plus éclatante
let coverRing = null, coverRingKey;
function ringCoverColors(cover) {
  if (cover === coverRingKey) return;
  coverRingKey = cover;
  if (!cover) { coverRing = null; applyRing(); return; }
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 24;
      const x = cv.getContext("2d");
      x.drawImage(img, 0, 0, 24, 24);
      const d = x.getImageData(0, 0, 24, 24).data;
      let r = 0, g = 0, b = 0, w = 0, best = null, bestSat = -1;
      for (let i = 0; i < d.length; i += 4) {
        const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
        const k = 0.05 + (mx - mn) / 255;
        r += d[i] * k; g += d[i + 1] * k; b += d[i + 2] * k; w += k;
        const sat = (mx - mn) * (mx / 255);
        if (sat > bestSat) { bestSat = sat; best = [d[i], d[i + 1], d[i + 2]]; }
      }
      const a = vivid([r / w, g / w, b / w]), c = vivid(best);
      // Couleurs lumineuses : un anneau doit briller même sur une pochette sombre
      coverRing = { a: `hsl(${a.h} ${Math.max(a.s, 60)}% ${Math.max(a.l, 55)}%)`, b: `hsl(${c.h} ${Math.max(c.s, 60)}% ${Math.max(c.l, 70)}%)` };
    } catch { coverRing = null; }
    applyRing();
  };
  img.onerror = () => { coverRing = null; applyRing(); };
  img.src = cover;
}

function cssRgb(c) {
  const m = /^#?([0-9a-f]{6})$/i.exec(c);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  const r = /rgba?\(([^)]+)\)/.exec(c);
  return r ? r[1].split(",").slice(0, 3).map(Number) : null;
}

// Couleur → teinte / saturation / luminosité.
// exact : on garde la couleur telle quelle (choix de l'utilisateur, même très foncée ou très claire).
// Sinon (couleur moyenne d'une pochette) : on la ravive un peu sans changer sa clarté de plus de raison.
function vivid(rgb, exact) {
  if (!rgb) return { h: 329, s: 91, l: 86 }; // sans pochette : rose pâle
  const [r, g, b] = rgb.map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = Math.round((h * 60 + 360) % 360);
  const s = d ? Math.round((d / (1 - Math.abs(2 * l - 1))) * 100) : 0;
  if (exact) return { h, s, l: Math.round(l * 100) };
  return { h, s: d < 0.08 ? s : Math.min(90, Math.max(s, 50)), l: Math.max(18, Math.min(78, Math.round(l * 100))) };
}
// Garde une valeur de luminosité dans 0–100
const clampL = (v) => Math.max(0, Math.min(100, v));

// Mosaïque façon vitrail : une grille de points décalés au hasard, chaque cellule coupée en deux triangles
function drawMosaic(c) {
  const cv = document.querySelector("#musicMosaic");
  const box = cv.getBoundingClientRect();
  const dpr = window.HUSH_ECO ? 1 : Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.max(1, box.width * dpr);
  cv.height = Math.max(1, box.height * dpr);
  const x = cv.getContext("2d");
  const W = cv.width, H = cv.height, cols = 10, rows = 6, cw = W / cols, ch = H / rows;
  if (S.playerBg === "gradient") {
    // Fond sans motif : dégradé radial dans la couleur du lecteur
    const g = x.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.55);
    g.addColorStop(0, `hsl(${c.h} ${c.s}% ${clampL(c.l + 10)}%)`);
    g.addColorStop(0.6, `hsl(${c.h} ${c.s}% ${clampL(c.l * 0.7)}%)`);
    g.addColorStop(1, `hsl(${c.h} ${c.s}% ${clampL(c.l * 0.4)}%)`);
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    return;
  }
  const pts = [];
  for (let j = 0; j <= rows; j++) {
    pts[j] = [];
    for (let i = 0; i <= cols; i++) {
      const edge = i === 0 || j === 0 || i === cols || j === rows;
      pts[j][i] = [i * cw + (edge ? 0 : (Math.random() - 0.5) * cw * 0.7), j * ch + (edge ? 0 : (Math.random() - 0.5) * ch * 0.7)];
    }
  }
  x.fillStyle = `hsl(${c.h} ${c.s}% ${clampL(c.l * 0.25)}%)`;
  x.fillRect(0, 0, W, H);
  x.lineJoin = "round";
  x.lineWidth = 3 * dpr;
  x.strokeStyle = `hsl(${c.h} ${c.s}% ${clampL(c.l * 0.2)}%)`;
  const tri = (a, b, d) => {
    x.beginPath(); x.moveTo(...a); x.lineTo(...b); x.lineTo(...d); x.closePath();
    x.fillStyle = `hsl(${c.h + (Math.random() - 0.5) * 16} ${c.s}% ${clampL(c.l - 22 + Math.random() * 40)}%)`;
    x.fill(); x.stroke();
  };
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const p = pts[j][i], q = pts[j][i + 1], r = pts[j + 1][i + 1], s = pts[j + 1][i];
      if (Math.random() < 0.5) { tri(p, q, r); tri(p, r, s); } else { tri(p, q, s); tri(q, r, s); }
    }
  }
  // Voile sombre pour que le texte reste lisible
  x.fillStyle = "rgba(0,0,0,.22)";
  x.fillRect(0, 0, W, H);
}

// Onde blanche entre la pochette et le vinyle : vraie analyse si le son joue ici, sinon animation
function drawWave(t, playing) {
  const cv = document.querySelector("#musicWave");
  if (!cv || document.querySelector("#music").hidden) return;
  const dpr = window.HUSH_ECO ? 1 : Math.min(devicePixelRatio || 1, 2);
  // La mosaïque est redessinée si la carte a changé de taille (fenêtre redimensionnée, carte réaffichée)
  const mos = document.querySelector("#musicMosaic");
  if (Math.abs(mos.width - mos.clientWidth * dpr) > 2) drawMosaic(cardColor);
  const w = cv.clientWidth * dpr, h = cv.clientHeight * dpr;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const x = cv.getContext("2d");
  x.clearRect(0, 0, w, h);
  x.fillStyle = "#fff";
  const n = 34, gap = w / n, live = audioLevel() !== null;
  for (let i = 0; i < n; i++) {
    const dist = Math.abs(i - n / 2) / (n / 2);
    let v;
    if (live) v = Sounds.data[Math.floor((i / n) * 48)] / 255;
    else v = playing ? 0.25 + 0.75 * Math.abs(Math.sin(t * 0.008 + i * 0.9) * Math.sin(t * 0.0031 + i * 0.37)) : 0.06;
    const bh = Math.max(dpr * 2, v * h * (1 - dist * 0.6));
    x.globalAlpha = 0.55 + 0.45 * (1 - dist);
    x.fillRect(i * gap + gap * 0.3, (h - bh) / 2, Math.max(dpr, gap * 0.4), bh);
  }
  x.globalAlpha = 1;
}

function sourceLabel(t) {
  if (S.musicSource === "files") return "Mes sons";
  if (S.musicSource === "spotify") return "Spotify";
  if (S.musicSource === "manual") return "Hush";
  const app = (t && t.app) || "";
  if (/deezer/i.test(app)) return "Deezer";
  if (/spotify/i.test(app)) return "Spotify";
  if (/chrome|opera|firefox|edge|brave/i.test(app)) return "Navigateur";
  return "Ce PC";
}

/* ——— Mode Paroles ——— */
const lyr = { key: null, lines: [], plain: null, status: "idle", error: null, idx: -2, flash: 0, lastLevel: 0 };

function parseLRC(text) {
  const out = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
    if (!tags.length) continue;
    const words = raw.replace(/\[[^\]]*\]/g, "").trim();
    for (const m of tags) out.push({ t: (Number(m[1]) * 60 + Number(m[2].replace(":", "."))) * 1000, text: words });
  }
  return out.sort((a, b) => a.t - b.t);
}

async function ensureLyrics(track) {
  const key = track ? `${track.soundId || ""}|${track.artist}|${track.title}` : null;
  if (key === lyr.key) return;
  Object.assign(lyr, { key, lines: [], plain: null, idx: -2, error: null, status: track ? "loading" : "idle" });
  if (!track) return;
  const r = await window.studio.lyrics.get({ title: track.title, artist: track.artist, duration: track.duration, soundId: track.soundId });
  if (lyr.key !== key) return; // le morceau a changé pendant la recherche
  lyr.lines = parseLRC(r.synced);
  lyr.plain = r.plain;
  lyr.error = r.error || null;
  lyr.status = lyr.lines.length ? "ok" : r.error ? "error" : "none";
}

function showLyric(text, sub) {
  const box = document.querySelector("#lyText");
  box.querySelectorAll(".ly-line").forEach((old) => {
    old.classList.remove("in");
    old.classList.add("out");
    setTimeout(() => old.remove(), 400);
  });
  if (!text) return;
  const line = document.createElement("div");
  line.className = "ly-line in" + (sub ? " sub" : "");
  line.textContent = text;
  box.appendChild(line);
}

// Appelé à chaque image quand la disposition « Paroles » est active
function lyricsFrame(track, posMs) {
  ensureLyrics(track);
  const scene = document.querySelector("#lyricsScene");
  scene.classList.toggle("playing", !!(track && track.playing));
  document.querySelector("#lyMeta").textContent = track ? [track.title, track.artist].filter(Boolean).join(" — ") : "";

  let idx = -1, text = "", sub = false;
  if (!track) { idx = -3; text = "Lance une musique pour voir les paroles"; sub = true; }
  else if (lyr.status === "loading") { idx = -4; text = "Recherche des paroles…"; sub = true; }
  else if (lyr.status !== "ok") { idx = -5; text = lyr.error || "Pas de paroles trouvées pour ce morceau"; sub = true; }
  else {
    for (let i = 0; i < lyr.lines.length && lyr.lines[i].t <= posMs + 150; i++) idx = i;
    text = idx >= 0 ? lyr.lines[idx].text || "♪" : "♪";
  }
  if (idx !== lyr.idx) {
    // Nouvelle ligne : apparition floue → nette, et parfois un éclair de lumière comme dans le clip
    if (idx >= 0 && lyr.idx >= -1 && Math.random() < 0.35) lyr.flash = 0.9;
    lyr.idx = idx;
    showLyric(text, sub);
  }
  // Sur un son joué ici, les coups forts déclenchent aussi un éclair
  const lvl = audioLevel();
  if (lvl !== null) {
    if (lvl - lyr.lastLevel > 0.18 && lvl > 0.55) lyr.flash = Math.max(lyr.flash, 0.7);
    lyr.lastLevel = lvl;
  }
  lyr.flash *= 0.9;
  document.querySelector("#lyFlash").style.opacity = lyr.flash > 0.01 ? lyr.flash.toFixed(3) : "0";
}
