/* ——— Menu clic droit sur un membre ———
   Seulement ce qui marche vraiment : ajouter en ami Hush, volume dans Hush, masquer, note, profil Discord, mention.
   Les actions de serveur (pseudo, rôles, déplacer, muet, sourdine, déconnecter) passent par le bot et n'apparaissent
   que si tu as toi-même la permission sur ce serveur. */
const UM = { el: null, sub: null, target: null, info: null };

function closeUserMenu() {
  if (UM.el) { UM.el.remove(); UM.el = null; }
  if (UM.sub) { UM.sub.remove(); UM.sub = null; }
  UM.target = null;
}
addEventListener("keydown", (e) => { if (e.key === "Escape") closeUserMenu(); });
addEventListener("pointerdown", (e) => { if (UM.el && !e.target.closest(".umenu")) closeUserMenu(); }, true);
addEventListener("blur", closeUserMenu);

document.addEventListener("contextmenu", (e) => {
  const tileEl = e.target.closest(".tile");
  if (!tileEl) return;
  e.preventDefault();
  const m = state.members.find((x) => x.id === tileEl.dataset.id);
  if (m) openUserMenu(m, e.clientX, e.clientY);
});

const isBotMode = () => state.mode === "bot" && !S.demo;
const isRpcMode = () => state.mode !== "bot" && !S.demo;
const userAct = (a) => window.studio.voice.user(a);

function umItem(label, opts = {}) {
  const b = document.createElement("button");
  b.className = "um-item" + (opts.danger ? " danger" : "") + (opts.sub ? " has-sub" : "");
  b.type = "button";
  const span = document.createElement("span");
  span.textContent = label;
  b.appendChild(span);
  if (opts.check !== undefined) {
    const c = document.createElement("i");
    c.className = "um-check" + (opts.check ? " on" : "");
    b.appendChild(c);
  }
  if (opts.ext) { const x = document.createElement("small"); x.textContent = "↗"; b.appendChild(x); }
  if (opts.sub) { const x = document.createElement("small"); x.textContent = "›"; b.appendChild(x); }
  if (opts.off) { b.disabled = true; b.title = opts.off; }
  if (opts.title) b.title = opts.title;
  if (opts.onClick) b.onclick = opts.onClick;
  return b;
}
const umSep = () => Object.assign(document.createElement("div"), { className: "um-sep" });

// Lance une action du bot, affiche le résultat, puis rafraîchit le menu
async function umRun(a, done) {
  try { await userAct(a); if (done) showToast(done); }
  catch (e) { showToast(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "")); }
}

function openUserMenu(m, x, y) {
  closeUserMenu();
  UM.target = m.id;
  UM.info = null;
  const el = document.createElement("div");
  el.className = "umenu glass";
  el.setAttribute("role", "menu");
  UM.el = el;
  document.body.appendChild(el);
  renderUserMenu(m);
  place(el, x, y);
  // Bot (même en connexion directe, si ton compte y est lié) : on lui demande ce que tu as le droit de faire
  if (!S.demo && /^\d{5,25}$/.test(m.id)) {
    userAct({ action: "info", target: m.id }).then((info) => {
      if (UM.target !== m.id || !UM.el) return;
      UM.info = info;
      const r = UM.el.getBoundingClientRect();
      renderUserMenu(m);
      place(UM.el, r.left, r.top);
    }).catch((e) => {
      if (UM.target !== m.id || !UM.el) return;
      let msg = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
      if (/Pas connecté au bot|n'a pas répondu/.test(msg)) msg = "Lance le bot et lie ton compte (Compte › Modifier la connexion › Avec le bot, puis Se connecter)";
      UM.info = { error: msg }; // pas de bot : le menu garde seulement ce qui marche sans lui
    });
  }
}

// Échelle du menu. Réglage « taille fixe » (par défaut) : il garde la même taille à l'écran quel que soit le zoom
// (zoom de la page Ctrl + / Ctrl −, molette sur la scène) et ne rapetisse jamais, il défile s'il est trop haut.
// Désactivé : il suit le zoom de la page et celui de la scène, comme le reste.
function menuScale() {
  let pz = 1;
  try { pz = window.studio.pageZoom() || 1; } catch {}
  if (S.menuFixed !== false) return { k: 1 / pz, fit: false };
  return { k: Math.max(0.7, Math.min(1.6, (S.zoom || 0.55) / 0.55)), fit: true };
}

function place(el, x, y) {
  const { k, fit } = menuScale();
  el.style.scale = "";
  el.style.maxHeight = "none";
  const full = el.scrollHeight + 12;
  // Mode « suit le zoom » : il peut rapetisser (jusqu'à 60 %) pour tenir dans la fenêtre
  const s = fit ? Math.max(0.6 * k, Math.min(k, (innerHeight - 12) / full)) : k;
  // « scale » et pas « transform » : l'animation d'ouverture (pop) écraserait transform
  el.style.transformOrigin = "0 0";
  el.style.scale = s !== 1 ? s.toFixed(3) : "";
  el.style.maxHeight = Math.floor((innerHeight - 12) / s) + "px"; // une fois mis à l'échelle, il tient à l'écran
  el.dataset.scale = s;
  const W = innerWidth, H = innerHeight, w = el.offsetWidth * s, h = el.offsetHeight * s;
  el.style.left = Math.max(6, Math.min(x, W - w - 6)) + "px";
  el.style.top = Math.max(6, Math.min(y, H - h - 6)) + "px";
}

// Où en est-on avec cette personne côté amis Hush
function friendState(id) {
  const fr = typeof Home !== "undefined" && Home.friends;
  if (!fr) return "unknown";
  if (fr.friends.some((p) => p.id === id)) return "friend";
  if (fr.outgoing.some((p) => p.id === id)) return "sent";
  if (fr.incoming.some((p) => p.id === id)) return "incoming";
  return "none";
}

function renderUserMenu(m) {
  const el = UM.el;
  el.textContent = "";
  if (UM.sub) { UM.sub.remove(); UM.sub = null; }
  const id = m.id;
  const real = /^\d{5,25}$/.test(id);
  const info = UM.info;
  const isMe = state.me && id === state.me.id;

  const head = document.createElement("div");
  head.className = "um-head";
  head.textContent = m.name;
  el.appendChild(head);

  // — Amis Hush —
  if (!isMe && real) {
    const st = friendState(id);
    if (st === "friend") el.appendChild(umItem("✓ Ami Hush", { off: "Vous êtes déjà amis" }));
    else if (st === "sent") el.appendChild(umItem("Demande d'ami envoyée", { off: "En attente de sa réponse" }));
    else if (st === "incoming") el.appendChild(umItem("Accepter sa demande d'ami", { onClick: () => { friendOp("accept", id); closeUserMenu(); } }));
    else el.appendChild(umItem("➕ Ajouter en ami Hush", {
      onClick: async () => {
        closeUserMenu();
        const r = await window.studio.friends.op("add", id);
        if (r.error) showToast(/n'existe pas|inconnue/i.test(r.error) ? `${m.name} n'utilise pas encore Hush : envoie-lui le lien de 1999` : r.error);
        else { showToast(`Demande d'ami envoyée à ${m.name}`); friendOp("list"); }
      },
    }));
  }

  // — Dans Hush —
  if (!isMe) {
    const vol = document.createElement("div");
    vol.className = "um-vol";
    const val = Math.round((S.userGain[id] ?? 1) * 100);
    const lab = document.createElement("label");
    lab.innerHTML = `<span>Volume dans Hush</span><output>${val} %</output>`;
    const range = document.createElement("input");
    range.type = "range"; range.min = 0; range.max = 200; range.value = val;
    range.setAttribute("aria-label", "Volume dans Hush");
    range.title = "Rend cette voix plus ou moins « forte » pour l'anneau et la caméra (le son de Discord ne change pas)";
    range.oninput = () => { lab.querySelector("output").textContent = range.value + " %"; S.userGain[id] = +range.value / 100; save(); };
    vol.append(lab, range);
    el.appendChild(vol);
  }
  el.appendChild(umItem("Masquer dans Hush", {
    check: S.hiddenUsers.includes(id),
    onClick: () => {
      S.hiddenUsers = S.hiddenUsers.includes(id) ? S.hiddenUsers.filter((x) => x !== id) : [...S.hiddenUsers, id];
      save(); syncTiles(); closeUserMenu();
      showToast(S.hiddenUsers.includes(id) ? `${m.name} est masqué (clic droit sur le fond pour tout réafficher)` : `${m.name} est de nouveau affiché`);
    },
  }));
  el.appendChild(umItem(S.notes[id] ? "Modifier la note" : "Ajouter une note", { onClick: () => noteEditor(m) }));
  if (real) {
    el.appendChild(umSep());
    el.appendChild(umItem("Voir le profil dans Discord", { ext: true, onClick: () => { window.studio.voice.openProfile(id); closeUserMenu(); } }));
    el.appendChild(umItem("Copier la mention", { title: "À coller dans un salon textuel", onClick: () => { window.studio.voice.copy(`<@${id}>`); showToast(`Mention de ${m.name} copiée : colle-la dans Discord`); closeUserMenu(); } }));
  }

  // — Modération : seulement ce que tu as vraiment le droit de faire sur ce serveur (demandé au bot) —
  const p = (info && info.perms) || {};
  if (info && !info.error && (p.nick || p.roles || p.move || p.mute || p.deaf)) {
    el.appendChild(umSep());
    if (p.nick) el.appendChild(umItem("Changer le pseudo", { onClick: () => nickEditor(m) }));
    if (p.roles) el.appendChild(umItem("Rôles", { sub: true, onClick: (e) => subMenu(e.currentTarget, rolesMenu(m)) }));
    if (p.move) el.appendChild(umItem("Déplacer vers", { sub: true, onClick: (e) => subMenu(e.currentTarget, moveMenu(m)) }));
    if (p.mute) el.appendChild(umItem("Rendre muet sur le serveur", {
      danger: true, check: !!info.serverMute,
      onClick: async () => { await umRun({ action: "mute", target: id, on: !info.serverMute }, info.serverMute ? `${m.name} peut reparler` : `${m.name} est muet sur le serveur`); closeUserMenu(); },
    }));
    if (p.deaf) el.appendChild(umItem("Mettre en sourdine sur le serveur", {
      danger: true, check: !!info.serverDeaf,
      onClick: async () => { await umRun({ action: "deaf", target: id, on: !info.serverDeaf }, info.serverDeaf ? `${m.name} entend de nouveau` : `${m.name} est en sourdine sur le serveur`); closeUserMenu(); },
    }));
    if (p.move && !isMe) el.appendChild(umItem("Déconnecter du vocal", {
      danger: true,
      onClick: async () => { await umRun({ action: "disconnect", target: id }, `${m.name} a été déconnecté du vocal`); closeUserMenu(); },
    }));
  }
}

function subMenu(anchor, sub) {
  // Le sous-menu va dans la page (pas dans le menu : son verre le rognerait)
  if (UM.sub) UM.sub.remove();
  sub.className = "umenu sub glass";
  UM.sub = sub;
  document.body.appendChild(sub);
  // Même échelle que le menu principal
  const s = parseFloat(UM.el.dataset.scale) || 1;
  sub.style.position = "fixed";
  sub.style.transformOrigin = "0 0";
  sub.style.scale = s !== 1 ? String(s) : "";
  sub.style.maxHeight = Math.floor(innerHeight * 0.6 / s) + "px";
  const a = anchor.getBoundingClientRect(), w = sub.offsetWidth * s, h = sub.offsetHeight * s;
  const left = a.right + 4 + w < innerWidth ? a.right + 4 : a.left - w - 4;
  sub.style.left = Math.max(6, left) + "px";
  sub.style.top = Math.max(6, Math.min(a.top - 6, innerHeight - h - 6)) + "px";
}

function rolesMenu(m) {
  const box = document.createElement("div");
  const roles = (UM.info && UM.info.roles) || [];
  if (!roles.length) box.appendChild(Object.assign(document.createElement("div"), { className: "um-empty", textContent: "Aucun rôle" }));
  for (const r of roles) {
    const b = umItem(r.name, {
      check: r.has, off: r.editable ? null : "Rôle au-dessus du tien (ou du bot)",
      onClick: async () => {
        await umRun({ action: "role", target: m.id, role: r.id, on: !r.has });
        r.has = !r.has;
        b.querySelector(".um-check").classList.toggle("on", r.has);
      },
    });
    if (r.color && r.color !== "#000000") b.querySelector("span").style.setProperty("--rc", r.color);
    b.classList.add("um-role");
    box.appendChild(b);
  }
  return box;
}

function moveMenu(m) {
  const box = document.createElement("div");
  for (const c of (UM.info && UM.info.channels) || []) {
    box.appendChild(umItem("🔊 " + c.name, {
      off: c.here ? "Il est déjà dans ce salon" : null,
      onClick: async () => { await umRun({ action: "move", target: m.id, channel: c.id }, `${m.name} → ${c.name}`); closeUserMenu(); },
    }));
  }
  return box;
}

// Petit champ de saisie dans le menu (pseudo, note)
function inlineEditor(title, value, placeholder, max, onOk) {
  const el = UM.el;
  el.textContent = "";
  const head = Object.assign(document.createElement("div"), { className: "um-head", textContent: title });
  const input = Object.assign(document.createElement("textarea"), { className: "field um-input", value, placeholder, maxLength: max, rows: max > 40 ? 3 : 1 });
  const row = document.createElement("div");
  row.className = "um-row";
  const ok = umItem("Enregistrer", { onClick: () => onOk(input.value.trim()) });
  const cancel = umItem("Annuler", { onClick: closeUserMenu });
  row.append(cancel, ok);
  el.append(head, input, row);
  input.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ok.click(); } };
  setTimeout(() => { input.focus(); input.select(); });
}
function nickEditor(m) {
  inlineEditor(`Pseudo de ${m.name} sur le serveur`, (UM.info && UM.info.nick) || "", "Vide = pseudo d'origine", 32, async (v) => {
    await umRun({ action: "nick", target: m.id, nick: v }, v ? `Pseudo changé en « ${v} »` : "Pseudo d'origine rétabli");
    closeUserMenu();
  });
}
function noteEditor(m) {
  inlineEditor(`Note sur ${m.name} (visible seulement par toi)`, S.notes[m.id] || "", "Ta note…", 300, (v) => {
    if (v) S.notes[m.id] = v; else delete S.notes[m.id];
    save(); syncTiles(); closeUserMenu();
  });
}

// Clic droit sur le fond de la scène : réafficher les membres masqués
document.addEventListener("contextmenu", (e) => {
  if (e.target.closest(".tile, .umenu, input, textarea, .settings") || !e.target.closest(".main")) return;
  if (!S.hiddenUsers.length) return;
  e.preventDefault();
  closeUserMenu();
  const el = document.createElement("div");
  el.className = "umenu glass";
  UM.el = el;
  el.appendChild(umItem(`Réafficher les membres masqués (${S.hiddenUsers.length})`, { onClick: () => { S.hiddenUsers = []; save(); syncTiles(); closeUserMenu(); } }));
  document.body.appendChild(el);
  place(el, e.clientX, e.clientY);
});
