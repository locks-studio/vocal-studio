/* ——— Sons de l'interface ———
   Tous fabriqués ici (WebAudio), sans fichier : des sons courts, doux et « verre », dans la DA de Hush.
   On peut les couper dans Paramètres › Musique › Sons de l'interface, avec leur volume. */
const Sfx = {
  ac: null, out: null, last: {},
  on() {
    if (typeof MINI !== "undefined" && MINI) return false; // l'overlay ne fait pas de bruit (sinon tout sonne deux fois)
    return typeof S === "undefined" || S.sfx !== false;
  },
  ctx() {
    if (!this.ac) {
      this.ac = new AudioContext();
      this.out = this.ac.createGain();
      this.out.connect(this.ac.destination);
    }
    if (this.ac.state === "suspended") this.ac.resume();
    this.out.gain.value = typeof S !== "undefined" && typeof S.sfxVol === "number" ? S.sfxVol : 0.7;
    return this.ac;
  },
  // Pas deux fois le même son en moins de « gap » ms
  gate(name, gap) {
    const now = performance.now();
    if (now - (this.last[name] || 0) < gap) return false;
    this.last[name] = now;
    return true;
  },
  // Une note : forme, fréquence (avec glissé), attaque et chute
  tone(ac, at, { type = "sine", f, f2, gain = 0.1, dur = 0.12, attack = 0.004 }) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, at);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, at + dur * 0.8);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.out);
    o.start(at); o.stop(at + dur + 0.02);
  },
  // Un souffle filtré (clics, glissés)
  noise(ac, at, { dur = 0.02, f = 3000, f2, q = 2, gain = 0.2, shape = 6 }) {
    const len = Math.max(1, Math.floor(ac.sampleRate * dur)), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, shape);
    const src = ac.createBufferSource(); src.buffer = buf;
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = q;
    bp.frequency.setValueAtTime(f, at);
    if (f2) bp.frequency.exponentialRampToValueAtTime(f2, at + dur);
    const g = ac.createGain(); g.gain.value = gain;
    src.connect(bp).connect(g).connect(this.out);
    src.start(at);
  },
  // Un son enregistré (fichier) : un lecteur audio gardé en mémoire, relancé depuis le début
  els: {},
  file(url, gain = 1) {
    const a = this.els[url] || (this.els[url] = Object.assign(new Audio(url), { preload: "auto" }));
    a.volume = Math.max(0, Math.min(1, gain * (typeof S !== "undefined" && typeof S.sfxVol === "number" ? S.sfxVol : 0.7)));
    a.currentTime = 0;
    return a.play().catch(() => {});
  },
  play(name, arg) {
    if (!this.on()) return;
    try {
      const ac = this.ctx(), t = ac.currentTime + 0.005;
      switch (name) {
        // « Tic » de molette de casque : survol d'un vocal dans la liste de gauche
        case "tick": {
          if (!this.gate("tick", 28)) return;
          this.noise(ac, t, { dur: 0.012, f: arg ? 3600 : 3100, q: 2.2, gain: 0.2 });
          this.tone(ac, t, { f: arg ? 2300 : 2050, gain: 0.03, dur: 0.018, attack: 0.001 });
          break;
        }
        // Clics : un son différent selon le bouton, très doux, et jamais exactement le même deux fois
        case "click": case "tap": {
          if (!this.gate("click", 60)) return;
          const v = 1 + (Math.random() - 0.5) * 0.12;
          this.tone(ac, t, { f: 700 * v, f2: 480 * v, gain: 0.03, dur: 0.05, attack: 0.002 });
          break;
        }
        // Onglet : juste un froissement léger, sans note
        case "tab": {
          if (!this.gate("click", 60)) return;
          this.noise(ac, t, { dur: 0.018, f: 2600 + Math.random() * 600, q: 1.1, gain: 0.07, shape: 3 });
          break;
        }
        // Pastille de choix : une note douce qui dépend de la pastille (ça fait une petite gamme)
        case "select": {
          if (!this.gate("click", 60)) return;
          const scale = [523.3, 587.3, 659.3, 784, 880, 1046.5, 1174.7, 1318.5, 1568];
          const f = scale[Math.max(0, Math.min(scale.length - 1, arg | 0))];
          this.tone(ac, t, { type: "triangle", f, gain: 0.028, dur: 0.12 });
          break;
        }
        // Interrupteur : « clic » qui monte (allumé) ou descend (éteint)
        case "switchOn": case "switchOff": {
          if (!this.gate("click", 60)) return;
          const on = name === "switchOn";
          this.noise(ac, t, { dur: 0.01, f: on ? 3200 : 2200, q: 2, gain: 0.08 });
          this.tone(ac, t + 0.012, { f: on ? 1046.5 : 698.5, gain: 0.022, dur: 0.06 });
          break;
        }
        // Fermer : une petite note qui descend
        case "close": {
          if (!this.gate("click", 60)) return;
          this.tone(ac, t, { f: 620, f2: 380, gain: 0.03, dur: 0.09 });
          break;
        }
        // Bouton principal (Rejoindre, Accepter…) : deux notes douces
        case "confirm": {
          if (!this.gate("click", 60)) return;
          this.tone(ac, t, { type: "triangle", f: 784, gain: 0.03, dur: 0.1 });
          this.tone(ac, t + 0.06, { type: "triangle", f: 1174.7, gain: 0.026, dur: 0.16 });
          break;
        }
        // Notification : deux notes de verre qui montent
        case "notif": {
          if (!this.gate("notif", 600)) return;
          this.tone(ac, t, { type: "triangle", f: 1318.5, gain: 0.07, dur: 0.38 });
          this.tone(ac, t + 0.11, { type: "triangle", f: 1975.5, gain: 0.06, dur: 0.55 });
          this.tone(ac, t + 0.11, { f: 3951, gain: 0.012, dur: 0.4 });
          break;
        }
        // Caméra : deux bips qui montent (allumée) ou descendent (éteinte)
        case "camOn": case "camOff": {
          if (!this.gate(name, 250)) return;
          const up = name === "camOn", a = up ? 660 : 990, b = up ? 990 : 660;
          this.tone(ac, t, { f: a, gain: 0.07, dur: 0.1 });
          this.tone(ac, t + 0.085, { f: b, gain: 0.07, dur: 0.16 });
          break;
        }
        // Stream : un petit arpège de trois notes, vers le haut ou vers le bas
        case "streamOn": case "streamOff": {
          if (!this.gate(name, 250)) return;
          const notes = name === "streamOn" ? [784, 988, 1319] : [1319, 988, 784];
          notes.forEach((f, i) => this.tone(ac, t + i * 0.07, { type: "triangle", f, gain: 0.06, dur: 0.18 }));
          break;
        }
        // Hush → Discord : le son choisi par Locks (assets/sfx/to-discord.ogg)
        case "toDiscord": {
          if (!this.gate(name, 400)) return;
          this.file("assets/sfx/to-discord.ogg", 1);
          break;
        }
        // Discord → Hush : un glissé qui monte, puis une note claire
        case "toHush": {
          if (!this.gate(name, 400)) return;
          this.noise(ac, t, { dur: 0.22, f: 600, f2: 4200, q: 1.2, gain: 0.16, shape: 1.6 });
          this.tone(ac, t + 0.12, { f: 784, f2: 1046.5, gain: 0.07, dur: 0.24 });
          break;
        }
      }
    } catch { /* pas de son : tant pis */ }
  },
};

// Un petit son sur les boutons cliquables, différent selon leur rôle (sauf ceux qui ont leur propre son)
const SFX_CLICKABLE = "button, [role='button'], [role='tab'], [role='switch'], a[href], .hs-row, .cam-card, input[type='checkbox'], input[type='radio'], select, summary";
const SFX_OWN = "#camBtn, #shareBtn, #homeDiscord, [data-nosfx]";
function sfxKind(el) {
  if (el.matches("[role='switch'], .switch, input[type='checkbox']")) {
    const on = el.getAttribute("aria-checked") === "true" || el.checked === true;
    return ["switchOff", "switchOn"][on ? 0 : 1]; // on entend l'état d'après le clic
  }
  if (el.matches("[role='tab'], [data-tab], [data-ht], .hs-tabs button, .nt-filters button")) return ["tab"];
  const seg = el.closest(".seg, .cur-grid, .bg-pick, .cam-list");
  if (seg) return ["select", [...seg.querySelectorAll("button")].indexOf(el)];
  const label = (el.getAttribute("aria-label") || el.title || "").toLowerCase();
  if (/fermer|close/.test(label) || /close|Close/.test(el.id || "") || el.matches(".x, .close")) return ["close"];
  if (el.matches(".cta, .hp-act.hot")) return ["confirm"];
  return ["tap"];
}
addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const el = e.target.closest && e.target.closest(SFX_CLICKABLE);
  if (!el || el.disabled || el.getAttribute("aria-disabled") === "true" || el.closest(SFX_OWN)) return;
  const k = sfxKind(el);
  Sfx.play(...(typeof k === "string" ? [k] : k));
}, true);

// Discord → Hush (pastille sur Discord) : le processus principal prévient
if (window.studio && window.studio.onSfx) window.studio.onSfx((name) => Sfx.play(name));
