// Site de 1999 : lit ./catalog.json (même dossier que la page), remplit les boutons de téléchargement,
// met en avant le système du visiteur, fait tourner la démo de Hush et gère les onglets d'installation.
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Quel système ? ----------
  const ua = navigator.userAgent || "";
  const plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua) || (navigator.userAgentData && navigator.userAgentData.mobile) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1); // iPad qui se fait passer pour un Mac
  const os = isMobile ? null : /Mac/i.test(plat + ua) ? "mac" : /Win/i.test(plat + ua) ? "windows" : /Linux|X11|CrOS/i.test(plat + ua) ? "linux" : null;
  const osName = { windows: "Windows", mac: "Mac", linux: "Linux" };

  // Clés du catalogue pour chaque système, avec le libellé du bouton
  const keys = {
    windows: [["win32-x64", "Télécharger pour Windows"]],
    mac: [["darwin-arm64", "Mac Apple Silicon (M1, M2…)"], ["darwin-x64", "Mac Intel"]],
    linux: [["linux-x64", "Télécharger pour Linux"]],
  };
  const mo = (b) => (b ? `${Math.round(b / 1e6)} Mo` : "");
  const ext = (u) => { const m = /\.(tar\.gz|zip|exe|dmg|AppImage)$/i.exec(u || ""); return m ? m[1] : ""; };

  // Copie dans le presse-papiers avec un retour visible sur le bouton
  async function copy(btn, text) {
    const label = btn.textContent;
    try { await navigator.clipboard.writeText(text); btn.textContent = "Copié"; }
    catch { btn.textContent = "Copie impossible"; }
    setTimeout(() => { btn.textContent = label; }, 1800);
  }

  // Empreinte SHA-256 du fichier, pour vérifier qu'il n'a pas été modifié
  function hashBox(file, label) {
    const box = document.createElement("details");
    box.className = "hash";
    if (!file.sha256) { box.hidden = true; return box; }
    const sum = document.createElement("summary");
    sum.textContent = label ? `Vérifier le fichier (${label})` : "Vérifier le fichier";
    const p = document.createElement("p");
    p.textContent = "Empreinte SHA-256 du fichier publié :";
    const code = document.createElement("code");
    code.textContent = file.sha256;
    const btn = document.createElement("button");
    btn.className = "mini-btn"; btn.type = "button"; btn.textContent = "Copier l'empreinte";
    btn.addEventListener("click", () => copy(btn, file.sha256));
    box.append(sum, p, code, btn);
    return box;
  }

  function renderNews(app) {
    const notes = (app && app.notes) || [];
    if (!notes.length) return;
    $("#news-version").textContent = app.version || "";
    const list = $("#news-list");
    for (const n of notes.slice(0, 5)) {
      const li = document.createElement("li");
      li.textContent = n;
      list.append(li);
    }
    $("#news").hidden = false;
  }

  function renderDownloads(launcher) {
    const dl = (launcher && launcher.downloads) || {};
    $("#dl-version").textContent = launcher && launcher.version ? launcher.version : "?";
    for (const card of $$(".plat")) {
      const id = card.dataset.os;
      const action = $(".plat-action", card);
      const found = keys[id].filter(([k]) => dl[k] && dl[k].url);
      action.textContent = "";
      if (!found.length) {
        const s = document.createElement("span");
        s.className = "soon"; s.textContent = "Bientôt";
        action.append(s);
        card.classList.add("is-soon");
        continue;
      }
      for (const [k, label] of found) {
        const a = document.createElement("a");
        a.className = "dl"; a.href = dl[k].url; a.setAttribute("download", "");
        a.innerHTML = `<span></span><span class="size"></span>`;
        a.firstChild.textContent = found.length > 1 ? label : "Télécharger";
        a.lastChild.textContent = [ext(dl[k].url), mo(dl[k].size)].filter(Boolean).join(", ");
        a.setAttribute("aria-label", `${label}, ${mo(dl[k].size)}`);
        action.append(a);
        action.append(hashBox(dl[k], found.length > 1 ? label : ""));
      }
      // Le type de fichier réel : si un vrai installeur .exe remplace le .zip, l'aide s'adapte
    }
    // Bouton principal de l'accueil : celui du système du visiteur s'il est dispo
    const mine = os && keys[os].find(([k]) => dl[k] && dl[k].url);
    const hero = $("#hero-dl");
    if (mine) {
      const d = dl[mine[0]];
      hero.href = d.url; hero.setAttribute("download", "");
      $(".btn-label", hero).textContent = os === "mac" ? `Télécharger pour ${mine[1]}` : mine[1];
      $("#hero-meta").textContent = `Version ${launcher.version}, ${mo(d.size)}`;
    } else if (os) {
      $(".btn-label", hero).textContent = `Bientôt sur ${osName[os]}`;
      $("#hero-meta").textContent = "Voir les autres systèmes";
    } else {
      $("#hero-meta").textContent = launcher && launcher.version ? `Version ${launcher.version}` : "Windows, Mac et Linux";
    }
  }

  if (os) {
    const card = $(`.plat[data-os="${os}"]`);
    card.classList.add("mine");
    card.parentElement.prepend(card); // son système en premier
  }
  if (isMobile) $("#mobile-note").hidden = false;

  function loadCatalog() {
    return fetch("./catalog.json", { cache: "no-cache" })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((c) => {
        renderDownloads(c.launcher);
        const hush = (c.apps || []).find((a) => a.id === "hush");
        if (hush && hush.version) $("#win-version").textContent = `v${hush.version}`;
        renderNews(hush);
      })
      .catch(() => {
        for (const a of $$(".plat-action")) {
          a.textContent = "";
          const p = document.createElement("p");
          p.className = "error"; p.textContent = "Liens indisponibles.";
          const b = document.createElement("button");
          b.className = "mini-btn retry"; b.type = "button"; b.textContent = "Réessayer";
          b.addEventListener("click", () => {
            for (const x of $$(".plat-action")) x.textContent = "Chargement…";
            loadCatalog();
          });
          a.append(p, b);
        }
        $("#hero-meta").textContent = "Windows, Mac et Linux";
      });
  }
  loadCatalog();
  // Sur téléphone, la feuille de partage du système ; sinon la copie du lien
  const pageUrl = location.origin + location.pathname;
  if (navigator.share) $("#copy-link").textContent = "Envoyer le lien";
  $("#copy-link").addEventListener("click", (e) => {
    if (navigator.share) navigator.share({ title: "1999", url: pageUrl }).catch(() => {});
    else copy(e.target, pageUrl);
  });

  // ---------- Onglets d'installation (flèches gauche/droite, Début/Fin) ----------
  const tabs = $$('[role="tab"]');
  function select(tab, focus) {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", on); t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    }
    if (focus) tab.focus();
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(t));
    t.addEventListener("keydown", (e) => {
      const n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (n === undefined) return;
      e.preventDefault(); select(tabs[(n + tabs.length) % tabs.length], true);
    });
  });
  if (os) select($(`#tab-${os}`));

  // ---------- Fenêtre en verre qui s'incline avec la souris ----------
  const win = $(".window");
  if (!reduced && matchMedia("(hover: hover) and (pointer: fine)").matches) {
    let raf = 0;
    $(".hero").addEventListener("pointermove", (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = win.getBoundingClientRect();
        const x = (e.clientX - (r.left + r.width / 2)) / innerWidth;
        const y = (e.clientY - (r.top + r.height / 2)) / innerHeight;
        win.style.setProperty("--ry", `${(-12 + x * 16).toFixed(2)}deg`);
        win.style.setProperty("--rx", `${(6 - y * 12).toFixed(2)}deg`);
        win.style.setProperty("--gx", `${((e.clientX - r.left) / r.width * 100).toFixed(1)}%`);
        win.style.setProperty("--gy", `${((e.clientY - r.top) / r.height * 100).toFixed(1)}%`);
      });
    });
  }

  // ---------- Noms en métal fondu : la vidéo arrive après la page et ne tourne que si elle est visible ----------
  // Safari lit mal la transparence de ces vidéos : il garde l'image fixe, comme ceux qui veulent moins de mouvement.
  const safari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
  if (!reduced && !safari) {
    const watch = new IntersectionObserver((list) => {
      for (const e of list) {
        const v = e.target;
        if (e.isIntersecting) { if (!v.src) v.src = v.dataset.src; v.play().catch(() => {}); }
        else v.pause();
      }
    }, { rootMargin: "120px" });
    addEventListener("load", () => $$("video.metal").forEach((v) => watch.observe(v)));
  }

  // ---------- Démo Hush : un salon vocal comme dans l'appli ----------
  // Mêmes pseudos et mêmes couleurs que le mode démo de Hush, mêmes mises en scène (Bande, Cinéma 3D, Grille),
  // même fond animé (hush-fond.js est le fichier de Hush). Tout est calculé ici, rien n'est envoyé nulle part.
  const demo = $("#demo"), stage = $("#stage"), cam = $("#cam"), sky = $("#sky");
  const NAMES = ["Locks", "Imo", "KCM", "Lazy", "Nuraskip", "Disk", "Stryzki", "Youbi", "Luzz", "Elo", "Dreamy", "Marga", "Sanji"];
  const HUES = [235, 8, 150, 45, 285, 192, 330, 100, 25, 260, 170, 350, 60];
  const MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 5.2 2"/><path d="M15 9.5V6a3 3 0 0 0-1-2.2M5 11a7 7 0 0 0 11.5 5.3M19 11a7 7 0 0 1-.4 2.3M12 18v3M4 4l16 16"/></svg>';
  const HEAD = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M4 15v-3a8 8 0 0 1 13.7-5.6M20 12v3"/><path d="M4 15h3v5H5a1 1 0 0 1-1-1zM20 15h-3v5h2a1 1 0 0 0 1-1z"/><path d="M3 3l18 18"/></svg>';
  const people = NAMES.map((name, i) => {
    const el = document.createElement("div");
    el.className = "t";
    el.style.setProperty("--h", HUES[i]);
    const muted = name === "Lazy", deaf = name === "Stryzki";
    el.classList.toggle("muted", muted || deaf);
    el.innerHTML = `<span class="nm"></span><span class="w"><span class="ring"></span><span class="av"><img src="img/discord-logo.png" alt=""></span>${muted ? `<span class="bd">${MIC}</span>` : deaf ? `<span class="bd">${HEAD}</span>` : ""}</span>`;
    el.querySelector(".nm").textContent = name;
    cam.append(el);
    // Petite profondeur propre à chacun : en Bande, ils ne sont pas tous parfaitement alignés (comme dans Hush)
    return { el, w: el.querySelector(".w"), name, silent: muted || deaf, depth: 0.88 + ((i * 37) % 13) / 60, dy: (((i * 53) % 9) - 4) / 100,
      lvl: 0, fast: 0, target: 0, talkUntil: 0, x: 0, y: 0, s: 0 };
  });

  let layout = "strip", focus = 5, camX = 0, camY = 0, zoom = 1, running = false, raf = 0;
  const follow = $("#t-cam"), t0 = performance.now();
  if (reduced) follow.checked = false;

  // Qui parle : une ou deux personnes à la fois, des phrases de 1 à 3 s, la voix qui monte et descend
  function voices(now) {
    const talking = people.filter((p) => p.talkUntil > now);
    if (talking.length < 2 && Math.random() < (talking.length ? 0.006 : 0.03)) {
      const free = people.filter((p) => !p.silent && p.talkUntil <= now);
      const p = free[(Math.random() * free.length) | 0];
      if (p) { p.talkUntil = now + 1000 + Math.random() * 2200; if (!talking.length) focus = people.indexOf(p); }
    }
    for (const p of people) {
      const on = p.talkUntil > now;
      // Syllabes : le volume vise une nouvelle valeur plusieurs fois par seconde
      if (on && Math.random() < 0.2) p.target = 0.25 + Math.random() * 0.75;
      if (!on) p.target = 0;
      p.fast += (p.target - p.fast) * (p.target > p.fast ? 0.55 : 0.16);
      p.lvl += (p.fast - p.lvl) * 0.12;
      if (on && people[focus].talkUntil <= now) focus = people.indexOf(p);
    }
  }

  // Place de chacun selon la mise en scène, en pixels de la scène (W × H)
  function place(W, H) {
    const vert = demo.classList.contains("vertical");
    const n = people.length, mid = (n - 1) / 2;
    if (layout === "grid") {
      const cols = vert ? 3 : 5, rows = Math.ceil(n / cols);
      const cell = Math.min((W * 0.86) / cols, (H * 0.78) / rows), s = cell * 0.6;
      people.forEach((p, i) => {
        const r = (i / cols) | 0, inRow = r === rows - 1 ? n - r * cols : cols, c = i - r * cols;
        p.x = W / 2 + (c - (inRow - 1) / 2) * cell; p.y = H * 0.47 + (r - (rows - 1) / 2) * cell + s * 0.12; p.s = s;
      });
      return { cx: W / 2, cy: H / 2, z: 1 };
    }
    // Bande et Cinéma 3D : une file de personnes ; le Cinéma 3D est la même file, filmée de beaucoup plus près
    const film = layout === "film";
    const s = vert ? W * (film ? 0.36 : 0.2) : H * (film ? 0.5 : 0.21);
    const gap = s * (film ? 1.45 : vert ? 1.6 : 1.18); // en vertical, le pseudo au-dessus a besoin de place
    people.forEach((p, i) => {
      const along = (i - mid) * gap, side = p.dy * s * 2.2;
      p.x = W / 2 + (vert ? side : along); p.y = H / 2 + (vert ? along : side) + (vert ? 0 : s * 0.1); p.s = s * (film ? 1 : p.depth);
    });
    const span = n * gap, view = vert ? H : W;
    // Sans caméra : toute la file, vue depuis le milieu
    if (!follow.checked) return { cx: W / 2, cy: H / 2, z: film ? 1 : Math.min(1, (view * 0.94) / span) };
    // La caméra va chercher qui parle
    const f = people[focus];
    const z = film ? 1 : Math.max(Math.min(1.25, (view * 0.94) / (span * 0.62)), (view * 0.94) / span);
    const pull = film ? 0 : 0.25; // en Cinéma 3D, celui qui parle est pile au centre
    const cx = vert ? W / 2 : f.x + (W / 2 - f.x) * pull, cy = vert ? f.y + (H / 2 - f.y) * pull : H / 2;
    return { cx, cy, z };
  }

  const ctx = sky.getContext("2d");
  function frame(now) {
    raf = 0;
    if (!running) return;
    voices(now);
    const W = stage.clientWidth, H = stage.clientHeight;
    // Fond « espace rose » de Hush, qui respire un peu avec les voix
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (sky.width !== Math.round(W * dpr) || sky.height !== Math.round(H * dpr)) { sky.width = Math.round(W * dpr); sky.height = Math.round(H * dpr); }
    const energy = Math.max(...people.map((p) => p.lvl));
    if (!demo.classList.contains("overlay") && window.Patterns) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      window.Patterns.draw("pinkspace", ctx, W, H, (now - t0) / 1000, energy, reduced ? 0 : 1);
    }
    const v = place(W, H);
    const k = reduced ? 1 : 0.06; // la caméra glisse doucement d'une personne à l'autre
    camX += (v.cx - camX) * k; camY += (v.cy - camY) * k; zoom += (v.z - zoom) * k;
    for (const p of people) {
      const on = p.lvl > 0.04;
      const sx = W / 2 + (p.x - camX) * zoom, sy = H / 2 + (p.y - camY) * zoom, size = p.s * zoom * (on ? 1 + p.lvl * 0.12 : 1);
      p.el.style.setProperty("--s", `${size.toFixed(1)}px`);
      p.el.style.transform = `translate(${(sx - size / 2).toFixed(1)}px,${(sy - size / 2).toFixed(1)}px)`;
      p.el.style.zIndex = on ? 3 : 1;
      p.el.classList.toggle("on", on);
      p.el.style.setProperty("--lvl", p.lvl.toFixed(3));
      // Animation « selon le volume » de Hush : l'avatar saute un peu et s'écrase sur les syllabes
      if (!reduced && on) {
        const punch = Math.max(-0.05, Math.min(0.09, (p.fast - p.lvl) * 0.6));
        p.w.style.setProperty("--lift", `${(-p.fast * 5).toFixed(2)}px`);
        p.w.style.setProperty("--sx", (1 - punch * 0.6).toFixed(4));
        p.w.style.setProperty("--sy", (1 + punch).toFixed(4));
      } else { p.w.style.removeProperty("--lift"); p.w.style.removeProperty("--sx"); p.w.style.removeProperty("--sy"); }
    }
    raf = requestAnimationFrame(frame);
  }
  function play() { if (!running) { running = true; raf = requestAnimationFrame(frame); } }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  let visible = false;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible && !document.hidden ? play() : stop(); }, { threshold: 0.15 }).observe(stage);
  document.addEventListener("visibilitychange", () => (document.hidden || !visible ? stop() : play()));
  { const v = place(stage.clientWidth, stage.clientHeight); camX = v.cx; camY = v.cy; zoom = v.z; }

  $$("[data-lay]").forEach((b) => b.addEventListener("click", () => {
    layout = b.dataset.lay;
    demo.classList.toggle("grid", layout === "grid");
    $$("[data-lay]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    follow.closest(".toggle").style.opacity = layout === "grid" ? 0.45 : 1;
  }));
  $("#t-glitch").addEventListener("change", (e) => demo.classList.toggle("glitch", e.target.checked));
  $("#t-vert").addEventListener("change", (e) => demo.classList.toggle("vertical", e.target.checked));
  $("#t-overlay").addEventListener("change", (e) => demo.classList.toggle("overlay", e.target.checked));
})();
