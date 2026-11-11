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
      if (id === "windows" && /\.exe$/i.test(dl["win32-x64"].url)) $("#win-step1").textContent = "Ouvre le fichier téléchargé.";
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
      $("#hero-meta").textContent = launcher && launcher.version ? `Version ${launcher.version}` : "Windows et Linux";
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
        $("#hero-meta").textContent = "Windows et Linux";
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

  // ---------- Démo Hush : quelqu'un parle, la caméra va le chercher ----------
  const demo = $(".demo"), cam = $("#cam"), avs = $$(".av", cam);
  const tCam = $("#t-cam");
  if (reduced) tCam.checked = false; // pas de zoom automatique si on a demandé moins de mouvement
  let speaker = -1, timer = 0, visible = false;
  // L'ordre de parole : pas deux fois le même d'affilée
  function nextSpeaker() {
    let n; do n = Math.floor(Math.random() * avs.length); while (n === speaker);
    speaker = n;
    avs.forEach((a, i) => a.classList.toggle("speaking", i === n));
    frame();
  }
  function frame() {
    const a = avs[speaker];
    if (!a || !tCam.checked) { cam.style.setProperty("--z", 1); cam.style.setProperty("--tx", "0%"); cam.style.setProperty("--ty", "0%"); return; }
    // offsetLeft/Top = centre de l'avatar (il est recentré par translate, qui n'y compte pas).
    // On grossit puis on glisse le plan pour ramener celui qui parle vers le centre, sans sortir les autres du cadre.
    const vert = demo.classList.contains("vertical");
    const z = vert ? 1.12 : 1.2, pull = 0.4;
    const x = (a.offsetLeft / cam.clientWidth) * 100, y = (a.offsetTop / cam.clientHeight) * 100;
    cam.style.setProperty("--z", z);
    cam.style.setProperty("--tx", `${((50 - x) * pull).toFixed(2)}%`);
    cam.style.setProperty("--ty", `${((50 - y) * pull).toFixed(2)}%`);
  }
  function play() { if (!timer && visible && !document.hidden) { nextSpeaker(); timer = setInterval(nextSpeaker, reduced ? 4200 : 2600); } }
  function stop() { clearInterval(timer); timer = 0; }
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? play() : stop(); }, { threshold: 0.25 }).observe($("#stage"));
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : play()));

  tCam.addEventListener("change", frame);
  $("#t-glitch").addEventListener("change", (e) => demo.classList.toggle("glitch", e.target.checked));
  $("#t-vert").addEventListener("change", (e) => { demo.classList.toggle("vertical", e.target.checked); requestAnimationFrame(frame); });
  $("#t-overlay").addEventListener("change", (e) => demo.classList.toggle("overlay", e.target.checked));
  addEventListener("resize", () => requestAnimationFrame(frame));
})();
