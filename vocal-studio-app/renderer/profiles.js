/* ——— Préréglages et profils ———
   Préréglage : un « look » enregistré (disposition, anneau, couleurs, fond…), qu'on applique en un clic,
   qu'on peut exporter en fichier .hush pour le partager et réimporter.
   Profil : tous les réglages de Hush d'un coup (look, lecteur, sons, noms de salons…). On en a autant
   qu'on veut (« Stream », « Potes »…) et on passe de l'un à l'autre. */
// Tout le visuel : appliquer un préréglage remet Hush exactement dans l'état où il a été enregistré
// (les couleurs choisies comprises : anneau, fond, accent).
const PRESET_KEYS = ["skin", "accent", "layout", "vertical", "vertNameTop", "freePos", "shape", "players", "zoom", "camera",
  "bg", "bgImage", "bgKind", "bgWePreview", "bgColor", "bgColor2", "bgZoom", "bgBlur", "blurType",
  "ring", "ringFrom", "ringColor", "ringColor2", "glow", "voiceMin", "avShadow", "avOutline", "avOutlineAuto", "avAnim", "speed", "joinAnim",
  "names", "cards", "hideMuted", "showMe", "namePos", "nameSize", "nameShift", "nameMask", "nameHover", "font", "pixel",
  "glitch", "glitchAmt", "glitchVoice", "glitchStyle", "musicOn", "playerColor", "playerBg", "playerW", "playerPos", "playerStyle", "camView"];
// Applique un préréglage : un réglage absent (préréglage d'une ancienne version) reprend sa valeur de base
function applyLook(data) {
  for (const k of PRESET_KEYS) {
    const v = k in data ? data[k] : DEFAULTS[k];
    S[k] = v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v;
  }
  normS();
  apply();
  loadBgImg();
}
const PROFILES_KEY = "hush-profiles";

function lookOf(src) {
  const o = {};
  for (const k of PRESET_KEYS) if (k in src) o[k] = src[k] && typeof src[k] === "object" ? JSON.parse(JSON.stringify(src[k])) : src[k];
  return o;
}

/* — Préréglages — */
function renderPresets() {
  const ul = $("#presetList");
  ul.textContent = "";
  const list = S.userPresets || [];
  if (!list.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "Aucun préréglage. Règle Hush comme tu aimes, donne un nom et enregistre.";
    ul.appendChild(li);
    return;
  }
  list.forEach((p, i) => {
    const li = document.createElement("li");
    const use = document.createElement("button");
    use.className = "snd-play";
    use.textContent = "▶";
    use.setAttribute("aria-label", `Appliquer ${p.name}`);
    use.onclick = () => { applyLook(p.data); showToast(`Préréglage « ${p.name} » appliqué`); };
    const info = document.createElement("span");
    info.className = "snd-info";
    const b = document.createElement("b"); b.textContent = p.name;
    const sm = document.createElement("small"); sm.textContent = [p.data.layout, p.data.ring, p.data.bg].filter(Boolean).join(" · ");
    info.append(b, sm);
    const upd = document.createElement("button");
    upd.className = "snd-mini"; upd.textContent = "⟳"; upd.title = "Remplacer par les réglages actuels";
    upd.onclick = () => { p.data = lookOf(S); save(); renderPresets(); showToast(`« ${p.name} » mis à jour`); };
    const exp = document.createElement("button");
    exp.className = "snd-mini"; exp.textContent = "⇩"; exp.title = "Exporter en fichier .hush";
    exp.onclick = () => exportPreset(p);
    const del = document.createElement("button");
    del.className = "snd-mini"; del.textContent = "✕"; del.title = "Supprimer";
    del.onclick = () => { S.userPresets.splice(i, 1); save(); renderPresets(); };
    li.append(use, info, upd, exp, del);
    ul.appendChild(li);
  });
}
function exportPreset(p) {
  const blob = new Blob([JSON.stringify({ hush: 1, name: p.name, data: p.data }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = p.name.replace(/[\\/:*?"<>|]+/g, "_") + ".hush";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
$("#presetSave").onclick = () => {
  const name = $("#presetName").value.trim() || `Préréglage ${(S.userPresets || []).length + 1}`;
  S.userPresets = [...(S.userPresets || []).filter((p) => p.name !== name), { name, data: lookOf(S) }];
  $("#presetName").value = "";
  save();
  renderPresets();
  showToast(`Préréglage « ${name} » enregistré`);
};
$("#presetName").onkeydown = (e) => { if (e.key === "Enter") $("#presetSave").click(); };
$("#presetImport").onclick = () => $("#presetFile").click();
$("#presetFile").onchange = async (e) => {
  for (const f of e.target.files) {
    try {
      const j = JSON.parse(await f.text());
      if (!j || typeof j.data !== "object") throw new Error();
      // On ne garde que les réglages de look connus : un fichier ne peut rien toucher d'autre
      const name = String(j.name || f.name.replace(/\.hush$/i, "")).slice(0, 40);
      S.userPresets = [...(S.userPresets || []).filter((p) => p.name !== name), { name, data: lookOf(j.data) }];
    } catch { showToast(`« ${f.name} » n'est pas un préréglage Hush`); }
  }
  e.target.value = "";
  save();
  renderPresets();
};

/* — Profils — */
function readProfiles() {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILES_KEY) || "null");
    if (p && p.list && p.active) return p;
  } catch {}
  return { active: "Principal", list: { Principal: null } };
}
function writeProfiles(p) {
  try { localStorage.setItem(PROFILES_KEY, JSON.stringify(p)); }
  catch { showToast("Profils non enregistrés (image de fond trop lourde ?)"); }
}
function renderProfiles() {
  const p = readProfiles();
  const sel = $("#profileSel");
  sel.textContent = "";
  for (const name of Object.keys(p.list)) {
    const o = document.createElement("option");
    o.value = o.textContent = name;
    sel.appendChild(o);
  }
  sel.value = p.active;
  $("#profileDel").disabled = Object.keys(p.list).length < 2;
}
// Passe sur un autre profil : on range les réglages actuels dans le profil en cours, puis on charge l'autre
// mode : "copy" (nouveau profil qui reprend les réglages actuels), "fresh" (réglages d'usine), sinon profil existant
function switchProfile(name, mode) {
  const p = readProfiles();
  p.list[p.active] = { ...S };
  const next = mode === "copy" ? { ...S } : mode === "fresh" ? { ...DEFAULTS } : p.list[name] || { ...DEFAULTS };
  p.active = name;
  p.list[name] = next;
  writeProfiles(p);
  S = { ...DEFAULTS, ...next, panel: true };
  normS();
  apply();
  loadBgImg();
  renderPresets();
  renderProfiles();
  showToast(`Profil « ${name} »`);
}
$("#profileSel").onchange = (e) => switchProfile(e.target.value);
$("#profileNew").onclick = () => {
  const p = readProfiles();
  let name = $("#profileName").value.trim();
  if (!name) { let i = 2; while (p.list["Profil " + i]) i++; name = "Profil " + i; }
  if (p.list[name]) return showToast("Ce profil existe déjà");
  $("#profileName").value = "";
  switchProfile(name, $("#profileCopy").getAttribute("aria-checked") === "true" ? "copy" : "fresh");
};
$("#profileCopy").onclick = (e) => e.currentTarget.setAttribute("aria-checked", e.currentTarget.getAttribute("aria-checked") !== "true");
$("#profileRename").onclick = () => {
  const name = $("#profileName").value.trim();
  const p = readProfiles();
  if (!name || p.list[name]) return showToast(name ? "Ce nom est déjà pris" : "Écris le nouveau nom dans la case");
  p.list[name] = { ...S };
  delete p.list[p.active];
  p.active = name;
  writeProfiles(p);
  $("#profileName").value = "";
  renderProfiles();
};
$("#profileDel").onclick = () => {
  const p = readProfiles();
  const names = Object.keys(p.list);
  if (names.length < 2) return;
  const gone = p.active;
  delete p.list[gone];
  p.active = names.find((n) => n !== gone);
  writeProfiles(p);
  S = { ...DEFAULTS, ...(p.list[p.active] || {}), panel: true };
  normS();
  apply();
  loadBgImg();
  renderPresets();
  renderProfiles();
  showToast(`Profil « ${gone} » supprimé`);
};
// Le profil en cours garde toujours une copie à jour des réglages (pour qu'un changement de profil ne perde rien)
addEventListener("beforeunload", () => { const p = readProfiles(); p.list[p.active] = { ...S }; writeProfiles(p); });

renderPresets();
renderProfiles();
