/* ——— Menu clic droit sur un membre, comme dans Discord ———
   Ce qui se fait dans Hush (note, masquer, volume dans Hush, mention copiée) marche partout.
   Volume et muet « pour toi » passent par Discord en connexion directe (RPC).
   Les actions de serveur (muet, sourdine, déplacer, pseudo, rôles, déconnecter) passent par le bot,
   et seulement si tu as toi-même la permission sur le serveur.
   Profil, message, appel, ami, blocage : Discord ne les ouvre pas aux applis, on ouvre le profil dans Discord. */
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
      place(UM.el, r.left, r.top, true);
    }).catch((e) => {
      if (UM.target !== m.id || !UM.el) return;
      let msg = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
      if (/Pas connecté au bot|n'a pas répondu/.test(msg)) msg = "Lance le bot et lie ton compte (Compte › Modifier la connexion › Avec le bot, puis Se connecter)";
      UM.info = { error: msg };
      renderUserMenu(m);
    });
  }
}

function place(el, x, y, keep) {
  // Le menu suit le zoom de la scène et rapetisse s'il est plus haut que la fenêtre : on voit tout jusqu'en bas
  el.style.transform = "";
  const full = el.scrollHeight + 12;
  const s = Math.max(0.5, Math.min(1, S.zoom || 1, (innerHeight - 12) / full));
  el.style.transformOrigin = "0 0";
  el.style.transform = s < 1 ? `scale(${s.toFixed(3)})` : "";
  el.style.maxHeight = s < 1 ? "none" : "";
  el.dataset.scale = s;
  const r = el.getBoundingClientRect();
  const W = innerWidth, H = innerHeight;
  el.style.left = Math.max(6, Math.min(x, W - r.width - 6)) + "px";
  el.style.top = Math.max(6, Math.min(keep ? y : y, H - r.height - 6)) + "px";
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

  // — Discord (ouvre le profil dans l'appli Discord) —
  const prof = () => { window.studio.voice.openProfile(id); closeUserMenu(); };
  const noDiscord = real ? null : "Membre fictif (mode démo)";
  el.append(
    umItem("Profil", { ext: true, off: noDiscord, onClick: prof }),
    umItem("Mentionner", { off: noDiscord, title: "Copie la mention à coller dans un salon textuel", onClick: () => { window.studio.voice.copy(`<@${id}>`); showToast(`Mention de ${m.name} copiée : colle-la dans Discord`); closeUserMenu(); } }),
  );
  if (!isMe) el.append(
    umItem("Envoyer un message", { ext: true, off: noDiscord, onClick: prof }),
    umItem("Commencer un appel", { ext: true, off: noDiscord, onClick: prof }),
  );
  el.append(umItem(S.notes[id] ? "Modifier la note" : "Ajouter une note", { onClick: () => noteEditor(m) }));
  el.appendChild(umSep());

  // — Volume —
  if (!isMe) {
    const vol = document.createElement("div");
    vol.className = "um-vol";
    const rpc = isRpcMode();
    const lab = document.createElement("label");
    const val = rpc ? (S.userVol[id] ?? 100) : Math.round((S.userGain[id] ?? 1) * 100);
    lab.innerHTML = `<span>${rpc ? "Volume de l'utilisateur" : "Volume dans Hush"}</span><output>${val} %</output>`;
    const range = document.createElement("input");
    range.type = "range"; range.min = 0; range.max = 200; range.value = val;
    range.setAttribute("aria-label", lab.firstChild.textContent);
    range.title = rpc ? "Change le volume de ce membre dans Discord, pour toi seulement" : "Rend cette voix plus ou moins « forte » pour l'anneau et la caméra (le son de Discord ne change pas)";
    range.oninput = () => {
      const v = +range.value;
      lab.querySelector("output").textContent = v + " %";
      if (rpc) { S.userVol[id] = v; userAct({ action: "volume", target: id, volume: v }).catch(() => {}); }
      else S.userGain[id] = v / 100;
      save();
    };
    vol.append(lab, range);
    el.appendChild(vol);
    el.appendChild(umItem("Rendre muet (pour toi)", {
      check: !!S.localMuted[id], off: isRpcMode() ? null : "Connexion directe (RPC) uniquement : le bot ne peut pas couper le son chez toi",
      onClick: () => { const on = !S.localMuted[id]; S.localMuted[id] = on; save(); umRun({ action: "localMute", target: id, on }); renderUserMenu(m); },
    }));
  }
  el.appendChild(umItem("Masquer dans Hush", {
    check: S.hiddenUsers.includes(id),
    onClick: () => {
      S.hiddenUsers = S.hiddenUsers.includes(id) ? S.hiddenUsers.filter((x) => x !== id) : [...S.hiddenUsers, id];
      save(); syncTiles(); closeUserMenu();
      showToast(S.hiddenUsers.includes(id) ? `${m.name} est masqué (clic droit sur le fond pour tout réafficher)` : `${m.name} est de nouveau affiché`);
    },
  }));
  el.appendChild(umSep());

  // — Serveur (bot) —
  const botOff = S.demo ? "Membre fictif (mode démo)" : !info ? "Demande au bot…" : info.error || null;
  const p = (info && info.perms) || {};
  const no = (ok, label) => botOff || (ok ? null : `Tu n'as pas la permission « ${label} » sur ce serveur`);
  el.appendChild(umItem("Changer le pseudo", { off: botOff || (p.nick ? null : "Tu ne peux pas changer le pseudo de ce membre"), onClick: () => nickEditor(m) }));
  el.appendChild(umItem("Rôles", { sub: true, off: no(p.roles, "Gérer les rôles"), onClick: (e) => subMenu(e.currentTarget, rolesMenu(m)) }));
  el.appendChild(umItem("Déplacer vers", { sub: true, off: no(p.move, "Déplacer des membres"), onClick: (e) => subMenu(e.currentTarget, moveMenu(m)) }));
  el.appendChild(umSep());
  el.appendChild(umItem("Rendre muet sur le serveur", {
    danger: true, check: !!(info && info.serverMute), off: no(p.mute, "Rendre les membres muets"),
    onClick: async () => { await umRun({ action: "mute", target: id, on: !info.serverMute }, info.serverMute ? `${m.name} peut reparler` : `${m.name} est muet sur le serveur`); closeUserMenu(); },
  }));
  el.appendChild(umItem("Mettre en sourdine sur le serveur", {
    danger: true, check: !!(info && info.serverDeaf), off: no(p.deaf, "Mettre en sourdine"),
    onClick: async () => { await umRun({ action: "deaf", target: id, on: !info.serverDeaf }, info.serverDeaf ? `${m.name} entend de nouveau` : `${m.name} est en sourdine sur le serveur`); closeUserMenu(); },
  }));
  if (!isMe) el.appendChild(umItem("Déconnecter du vocal", {
    danger: true, off: no(p.move, "Déplacer des membres"),
    onClick: async () => { await umRun({ action: "disconnect", target: id }, `${m.name} a été déconnecté du vocal`); closeUserMenu(); },
  }));
  el.appendChild(umSep());
  if (!isMe) el.append(
    umItem("Ajouter en ami", { ext: true, off: noDiscord, onClick: prof }),
    umItem("Bloquer", { ext: true, danger: true, off: noDiscord, onClick: prof }),
  );
  el.appendChild(umItem("Copier l'identifiant", { off: noDiscord, onClick: () => { window.studio.voice.copy(id); showToast("Identifiant copié"); closeUserMenu(); } }));
}

function subMenu(anchor, sub) {
  // Le sous-menu va dans la page (pas dans le menu : son verre le rognerait)
  if (UM.sub) UM.sub.remove();
  sub.className = "umenu sub glass";
  UM.sub = sub;
  document.body.appendChild(sub);
  const a = anchor.getBoundingClientRect(), r = sub.getBoundingClientRect();
  const left = a.right + 4 + r.width < innerWidth ? a.right + 4 : a.left - r.width - 4;
  sub.style.position = "fixed";
  const s = parseFloat(UM.el.dataset.scale) || 1;
  if (s < 1) { sub.style.transformOrigin = "0 0"; sub.style.transform = `scale(${s})`; }
  sub.style.left = left + "px";
  sub.style.top = Math.max(6, Math.min(a.top - 6, innerHeight - r.height - 6)) + "px";
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
