/* ——— Panneau de droite : réglages de ce qui est sélectionné ———
   Rien : le projet · Personne : pseudo, photo, couleur, volume · Bloc : volume, ligne · Scène : le style Hush */
const LOOK_DEF = { layout: "strip", skin: "nuit", bg: "pinkspace", ring: "solid", avAnim: "db", shape: "round", names: true, camera: true, glow: 25, bgColor: "#fcbbdd", bgColor2: "#9b7bff", ringColor: null, ringFrom: "origin" };
const LAYOUTS = [["strip", "Bande"], ["film", "Cinéma 3D"], ["cinema", "Dynamique"], ["grid", "Grille"], ["orbit", "Orbite"], ["free", "Libre"], ["scene", "Scène"], ["discord", "Discord"]];
const SKINS = [["nuit", "Nuit"], ["aurore", "Aurore"], ["braise", "Braise"], ["glace", "Glace"], ["neon", "Néon"], ["vert", "Halo vert"], ["papier", "Papier"]];
const BGS = [["pinkspace", "Espace rose"], ["space", "Espace"], ["solid", "Uni"], ["gradient", "Dégradé"], ["duo", "Double dégradé"], ["profile", "Profil"], ["image", "Image"]];
const RINGS = [["solid", "Plein"], ["aura", "Aura"], ["wave", "Vagues"], ["flame", "Flammes"], ["gradient", "Dégradé"]];
const ANIMS = [["db", "Selon le volume"], ["rhythm", "En rythme"], ["off", "Immobile"]];
const label = (list, v) => (list.find((x) => x[0] === v) || [, v])[1];
const lookVal = (look, k) => (k in look ? look[k] : LOOK_DEF[k]);
const lookLabel = (look) => [label(LAYOUTS, lookVal(look, "layout")), label(BGS, lookVal(look, "bg")), look.presetName].filter(Boolean).join(" · ");

function select(kind, id = null) {
  Sel.kind = kind;
  Sel.id = id;
  renderInspector();
}

function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, "");
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
function seg(list, value, onPick, cls = "seg wrap") {
  return h("div", { class: cls, role: "group" }, list.map(([v, l]) => h("button", { "aria-pressed": String(v === value), onclick: () => onPick(v) }, l)));
}
function field(labelTxt, ...kids) { return h("label", { class: "field" }, h("span", {}, labelTxt), ...kids); }
function slider(min, max, step, value, onInput, onCommit) {
  const i = h("input", { type: "range", min, max, step, value });
  i.addEventListener("pointerdown", beginGesture);
  i.addEventListener("input", () => onInput(+i.value));
  i.addEventListener("change", () => { endGesture(); onCommit && onCommit(); });
  return i;
}

function renderInspector() {
  const box = $("#inspector");
  box.textContent = "";
  if (Sel.kind === "person" && person(Sel.id)) return personPanel(box, person(Sel.id));
  if (Sel.kind === "clip" && clip(Sel.id)) return clipPanel(box, clip(Sel.id));
  if (Sel.kind === "scene" && scene(Sel.id)) return scenePanel(box, scene(Sel.id));
  projectPanel(box);
}

function projectPanel(box) {
  box.append(h("h3", {}, "Ton projet"));
  if (!P.people.length && !P.clips.length) {
    box.append(h("p", {}, "Importe un enregistrement pour commencer. Avec un zip Craig, chaque personne arrive sur sa propre ligne avec son pseudo."));
    return;
  }
  box.append(h("p", {}, `${P.people.length} personne(s) · ${fmt(duration(), false)} · ${P.format === "9:16" ? "vertical" : "horizontal"}`));
  box.append(h("h4", {}, "Personnes"));
  box.append(h("div", { class: "people-list" }, P.people.map((p) => h("button", { onclick: () => select("person", p.id) }, h("span", { class: "dot", style: `background:${p.color}` }), p.name))));
  box.append(h("h4", {}, "Style"));
  box.append(h("button", { style: "width:100%", onclick: () => select("scene", sceneAt(now()).id) }, "Régler le style de la scène"));
  box.append(h("h4", {}, "Raccourcis"));
  box.append(h("p", { class: "note" }, "Espace : lecture · S : couper · Suppr : effacer · Ctrl+Z / Ctrl+Y : annuler / rétablir · Alt pendant un glisser : sans aimant · Double-clic sur la ligne d'une personne : ajouter un passage où elle parle · Maintiens 1 à 9 pendant la lecture : la personne 1 à 9 parle."));
}

function personPanel(box, p) {
  box.append(h("h3", {}, h("span", { class: "dot", style: `width:12px;height:12px;border-radius:50%;background:${p.color}` }), "Personne"));
  const av = h("div", { class: "av", title: "Changer la photo", style: p.avatar ? `background-image:url("${p.avatar}")` : "" }, p.avatar ? "" : (p.name[0] || "?").toUpperCase());
  av.onclick = async () => {
    const img = await window.hs.pickImage();
    if (!img) return;
    checkpoint();
    p.avatar = await shrinkImage(img, 256);
    renderInspector();
  };
  const avBox = h("div", { class: "av-pick" }, av, h("div", {},
    h("div", { class: "row" }, h("button", { onclick: () => av.onclick() }, "Choisir une photo"),
      p.avatar ? h("button", { class: "ghost", onclick: () => { checkpoint(); p.avatar = null; renderInspector(); } }, "Retirer") : null),
    p.discordId ? h("div", { class: "note", style: "margin-top:6px" }, `Discord : ${p.discordId}`) : null));
  box.append(avBox);
  const name = h("input", { type: "text", value: p.name, maxlength: 40 });
  name.addEventListener("focus", beginGesture);
  name.addEventListener("input", () => { p.name = name.value || "?"; if (window.onProjectChange) window.onProjectChange(true); });
  name.addEventListener("blur", endGesture);
  box.append(field("Pseudo", name));
  const col = h("input", { type: "color", value: p.color });
  col.addEventListener("pointerdown", beginGesture);
  col.addEventListener("input", () => { p.color = col.value; });
  col.addEventListener("change", endGesture);
  box.append(h("div", { class: "swatch" }, col, "Couleur sur la timeline"));
  box.append(h("h4", {}, "Son"));
  const volTxt = h("span", {}, `Volume : ${Math.round(p.vol * 100)} %`);
  box.append(h("label", { class: "field" }, volTxt, slider(0, 2, 0.01, p.vol, (v) => { p.vol = v; volTxt.textContent = `Volume : ${Math.round(v * 100)} %`; })));
  const senTxt = h("span", {}, `Sensibilité de l'anneau : ${Math.round(p.sens * 100)} %`);
  box.append(h("label", { class: "field" }, senTxt, slider(0.3, 3, 0.01, p.sens, (v) => { p.sens = v; senTxt.textContent = `Sensibilité de l'anneau : ${Math.round(v * 100)} %`; Scene.lastSent = ""; })));
  box.append(h("p", { class: "note" }, "La sensibilité règle à partir de quel volume l'anneau s'allume, sans changer le son."));
  box.append(h("h4", {}, "Ajouter"));
  box.append(h("div", { class: "row" },
    h("button", { onclick: () => importInto(p.id) }, "Un fichier audio"),
    h("button", { onclick: () => { checkpoint(); const c = { id: uid(), row: p.id, kind: "talk", file: null, name: "Parle", start: now(), in: 0, dur: 2, srcDur: Infinity, gain: 1 }; P.clips.push(c); select("clip", c.id); } }, "Un passage « parle »")));
  box.append(h("h4", {}, " "));
  box.append(h("button", { class: "danger", style: "width:100%", onclick: () => removePerson(p.id) }, "Supprimer cette personne"));
}

function clipPanel(box, c) {
  box.append(h("h3", {}, c.kind === "talk" ? "Passage « parle »" : "Bloc audio"));
  if (c.kind === "audio") box.append(h("p", { class: "note", title: c.file }, baseName(c.file)));
  else box.append(h("p", { class: "note" }, "La personne s'anime pendant ce passage, sans fichier audio (pratique avec un enregistrement mélangé)."));
  box.append(h("p", {}, `Début ${fmt(c.start)} · Durée ${fmt(c.dur)}`));
  const rowsList = [...P.people.map((p) => [p.id, p.name]), ...(c.kind === "audio" ? [[SONS, "Sons (n'anime personne)"]] : [])];
  const sel = h("select", {}, rowsList.map(([v, l]) => h("option", { value: v, selected: v === c.row }, l)));
  sel.onchange = () => { checkpoint(); c.row = sel.value; renderInspector(); };
  box.append(field("Sur la ligne de", sel));
  if (c.kind === "audio") {
    const t = h("span", {}, `Volume du bloc : ${Math.round((c.gain ?? 1) * 100)} %`);
    box.append(h("label", { class: "field" }, t, slider(0, 2, 0.01, c.gain ?? 1, (v) => { c.gain = v; t.textContent = `Volume du bloc : ${Math.round(v * 100)} %`; Scene.lastSent = ""; })));
  }
  box.append(h("div", { class: "row" }, h("button", { onclick: cutAtPlayhead }, "Couper ici (S)"), h("button", { class: "danger", onclick: deleteSelection }, "Effacer (Suppr)")));
}

function scenePanel(box, s) {
  const i = P.scenes.indexOf(s);
  const next = P.scenes[i + 1];
  box.append(h("h3", {}, `Scène ${i + 1}`));
  box.append(h("p", {}, `De ${fmt(s.start, false)} à ${fmt(next ? next.start : duration(), false)}`));
  const set = (k, v) => { checkpoint(); s.look[k] = v; delete s.look.presetName; renderInspector(); };
  box.append(h("div", { class: "row" },
    h("button", { onclick: async () => {
      try {
        const pr = await window.hs.pickPreset();
        if (!pr) return;
        checkpoint();
        s.look = { ...pr.data, presetName: pr.name };
        renderInspector();
        toast(`Préréglage « ${pr.name} » appliqué à la scène ${i + 1}`);
      } catch (e) { toast(e.message || "Préréglage illisible"); }
    } }, "Importer un préréglage Hush"),
  ));
  box.append(h("p", { class: "note" }, "Dans Hush : Paramètres › Préréglages › ⇩ exporte un fichier .hush à importer ici. Tout le visuel est repris."));
  box.append(h("h4", {}, "Disposition"));
  box.append(seg(LAYOUTS, lookVal(s.look, "layout"), (v) => set("layout", v)));
  box.append(h("h4", {}, "Fond"));
  box.append(h("div", { class: "bg-grid" }, BGS.map(([v, l]) => h("button", { "aria-pressed": String(v === lookVal(s.look, "bg")), onclick: async () => {
    if (v === "image") {
      const img = await window.hs.pickImage();
      if (!img) return;
      checkpoint();
      s.look.bgImage = await shrinkImage(img, 1920);
      s.look.bg = "image";
      delete s.look.presetName;
      return renderInspector();
    }
    set("bg", v);
  } }, l))));
  const c1 = colorPick(lookVal(s.look, "bgColor"), (v) => (s.look.bgColor = v));
  const c2 = colorPick(lookVal(s.look, "bgColor2"), (v) => (s.look.bgColor2 = v));
  box.append(h("div", { class: "row", style: "margin-top:8px" }, h("div", { class: "swatch" }, c1, "Couleur 1"), h("div", { class: "swatch" }, c2, "Couleur 2")));
  box.append(h("h4", {}, "Couleurs de l'interface"));
  box.append(seg(SKINS, lookVal(s.look, "skin"), (v) => set("skin", v)));
  box.append(h("h4", {}, "Anneau"));
  box.append(seg(RINGS, lookVal(s.look, "ring"), (v) => set("ring", v)));
  const rc = colorPick(lookVal(s.look, "ringColor") || "#fcbbdd", (v) => { s.look.ringColor = v; s.look.ringFrom = "custom"; });
  box.append(h("div", { class: "row", style: "margin-top:8px" }, h("div", { class: "swatch" }, rc, "Couleur de l'anneau"),
    lookVal(s.look, "ringFrom") === "custom" ? h("button", { class: "ghost", onclick: () => { checkpoint(); s.look.ringFrom = "origin"; s.look.ringColor = null; renderInspector(); } }, "Par défaut") : null));
  const gl = h("span", {}, `Lueur : ${lookVal(s.look, "glow")}`);
  box.append(h("label", { class: "field", style: "margin-top:10px" }, gl, slider(0, 100, 1, lookVal(s.look, "glow"), (v) => { s.look.glow = v; gl.textContent = `Lueur : ${v}`; })));
  box.append(h("h4", {}, "Avatars"));
  box.append(seg(ANIMS, lookVal(s.look, "avAnim"), (v) => set("avAnim", v)));
  box.append(h("div", { style: "height:8px" }));
  box.append(seg([["round", "Ronds"], ["squircle", "Carrés"]], lookVal(s.look, "shape"), (v) => set("shape", v), "seg"));
  box.append(toggleRow("Afficher les pseudos", lookVal(s.look, "names"), (v) => set("names", v)));
  box.append(toggleRow("Caméra qui suit celui qui parle", lookVal(s.look, "camera"), (v) => set("camera", v)));
  box.append(h("h4", {}, "Découper"));
  box.append(h("div", { class: "row" },
    h("button", { onclick: () => splitScene(now()) }, "Nouvelle scène ici"),
    i > 0 ? h("button", { class: "danger", onclick: deleteSelection }, "Fusionner") : null));
}
function colorPick(value, onInput) {
  const c = h("input", { type: "color", value: value || "#fcbbdd" });
  c.addEventListener("pointerdown", beginGesture);
  c.addEventListener("input", () => { onInput(c.value); });
  c.addEventListener("change", endGesture);
  return c;
}
function toggleRow(txt, on, onChange) {
  const i = h("input", { type: "checkbox" });
  i.checked = !!on;
  i.onchange = () => onChange(i.checked);
  return h("label", { class: "toggle" }, txt, i);
}

// Images rangées dans le projet en petite taille (le projet reste léger)
function shrinkImage(dataUrl, max) {
  if (dataUrl.startsWith("data:image/gif")) return Promise.resolve(dataUrl); // un GIF garde son animation
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/webp", 0.9));
    };
    img.onerror = () => res(dataUrl);
    img.src = dataUrl;
  });
}
