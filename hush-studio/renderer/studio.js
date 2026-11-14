/* ——— Hush Studio : démarrage, import, projets, clavier, boucle d'affichage ——— */

/* — Fenêtre modale simple — */
function modal(build) {
  const m = $("#modal"), card = $("#modalCard");
  card.textContent = "";
  build(card);
  m.hidden = false;
  return () => (m.hidden = true);
}
function ask(title, text, choices) {
  return new Promise((res) => {
    const close = modal((card) => card.append(h("h2", {}, title), h("p", {}, text),
      h("div", { class: "row" }, choices.map(([v, l, cls]) => h("button", { class: cls || "", onclick: () => { close(); res(v); } }, l)))));
  });
}

/* — Analyse des pistes (avec barre de progression) — */
async function analyzeAll(files) {
  const todo = [...new Set(files)].filter((f) => f && !ENV.has(f));
  if (!todo.length) return;
  const pct = new Map(todo.map((f) => [f, 0]));
  let bar, txt;
  const close = modal((card) => {
    card.append(h("h2", {}, "Analyse des voix"), h("p", {}, "Hush Studio mesure le volume de chaque piste. Une seule fois par fichier, ensuite c'est instantané."));
    bar = h("i"); txt = h("p", { class: "note" }, "");
    card.append(h("div", { class: "progress" }, bar), txt);
  });
  const upd = () => {
    const v = [...pct.values()].reduce((a, b) => a + b, 0) / todo.length;
    bar.style.width = v + "%";
    txt.textContent = `${[...pct.values()].filter((x) => x >= 100).length} / ${todo.length} piste(s) · ${Math.round(v)} %`;
  };
  window.hs.onProgress((p) => { if (pct.has(p.file)) { pct.set(p.file, p.pct); upd(); } });
  upd();
  const errors = [];
  // Trois pistes à la fois : rapide sans geler le PC
  const queue = [...todo];
  const worker = async () => {
    while (queue.length) {
      const f = queue.shift();
      try { storeEnv(f, await window.hs.analyze(f)); }
      catch (e) { errors.push(`${baseName(f)} : ${e.message}`); }
      pct.set(f, 100); upd();
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  close();
  if (errors.length) await ask("Certains fichiers n'ont pas pu être lus", errors.join("\n"), [[1, "OK", "cta"]]);
}

/* — Import — */
async function importPaths(paths, targetRow = null) {
  if (!paths.length) return;
  const r = await window.hs.importFiles(paths);
  if (r.errors.length) toast(r.errors.join(" · "), 6000);
  if (!r.people.length && !r.files.length) return applyAvatars(r.avatars || [], true);
  await analyzeAll([...r.people.map((x) => x.file), ...r.files.map((x) => x.file)]);
  const wasEmpty = !P.clips.length;
  let mode = "person";
  if (r.files.length && !targetRow) {
    mode = await ask(r.files.length > 1 ? `${r.files.length} fichiers audio` : `« ${r.files[0].name} »`,
      "C'est quoi ? Une voix anime une personne (son anneau s'allume quand elle parle). La musique et les bruitages vont sur la ligne Sons.",
      [["person", r.files.length > 1 ? "Une personne par fichier" : "La voix d'une personne", "cta"], ["sons", "Musique / bruitages"], ["mixed", "Enregistrement mélangé"], [null, "Annuler", "ghost"]]);
    if (!mode) return;
  }
  checkpoint();
  const mk = (row, f) => {
    const env = ENV.get(f.file);
    if (!env) return null;
    const c = { id: uid(), row, kind: "audio", file: f.file, name: f.name, start: f.start ?? 0, in: 0, dur: env.duration, srcDur: env.duration, gain: 1 };
    P.clips.push(c);
    return c;
  };
  // Craig : une personne par piste, toutes calées au début (les pistes Craig sont déjà synchronisées)
  for (const x of r.people) {
    let p = P.people.find((q) => (x.discordId && q.discordId === x.discordId) || q.name === x.name);
    if (!p) p = addPerson({ name: x.name, discordId: x.discordId });
    mk(p.id, { ...x, start: 0 });
  }
  const at = wasEmpty ? 0 : now();
  for (const f of r.files) {
    if (targetRow) mk(targetRow, { ...f, start: at });
    else if (mode === "person") mk(addPerson({ name: f.name.replace(/^\d+-/, "") }).id, { ...f, start: at });
    else mk(SONS, { ...f, start: at });
  }
  if (mode === "mixed") {
    if (!P.people.length) { addPerson({ name: "Personne 1" }); addPerson({ name: "Personne 2" }); }
    toast("Audio mélangé : ajoute les personnes, puis maintiens 1, 2, 3… pendant la lecture quand chacune parle", 8000);
  }
  if (wasEmpty && r.info && r.info.channel) { P.name = r.info.channel.replace(/[^\p{L}\p{N} '’_-]+/gu, " ").trim() || P.name; $("#projName").value = P.name; }
  select(null);
  if (wasEmpty) { fitAll(); seek(0); }
  refresh();
  if (r.people.length) toast(`${r.people.length} personne(s) importée(s) depuis Craig`);
  if ((r.avatars || []).length) await applyAvatars(r.avatars, false);
}

// Photos de profil (zip « avatars » de Craig, ou images « 1-pseudo.png ») : chacune va à la personne qui a le même
// ID Discord, sinon le même pseudo (majuscules et accents ignorés)
async function applyAvatars(list, ownStep) {
  if (!list.length) return;
  const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (ownStep) checkpoint();
  let n = 0;
  const missing = [];
  for (const a of list) {
    const p = P.people.find((q) => a.discordId && q.discordId === a.discordId) || P.people.find((q) => norm(q.name) === norm(a.name));
    if (!p) { missing.push(a.name); continue; }
    p.avatar = await shrinkImage(a.data, 256);
    n++;
  }
  refresh();
  toast(n ? `${n} photo(s) de profil ajoutée(s)${missing.length ? ` · personne pour : ${missing.join(", ")}` : ""}` : `Aucune personne ne correspond à ces photos (${missing.join(", ")}). Importe d'abord l'audio Craig.`, 7000);
}
async function importInto(row) { importPaths(await window.hs.pickAudio(), row); }

/* — Projets — */
function afterLoad() {
  if (!P.scenes || !P.scenes.length) P.scenes = [{ id: uid(), start: 0, look: {} }];
  P.scenes[0].start = 0;
  if (Sel.id && !(person(Sel.id) || clip(Sel.id) || scene(Sel.id))) Sel.kind = Sel.id = null;
  $("#projName").value = P.name;
  Scene.lookKey = ""; Scene.lastSent = "";
  fitScene();
  refresh();
}
async function loadProject(data, file) {
  P = data;
  projectFile = file;
  History.undo = []; History.redo = [];
  Sel.kind = Sel.id = null;
  // Fichiers déplacés ou renommés : on demande où ils sont
  const files = [...new Set(P.clips.filter((c) => c.kind === "audio").map((c) => c.file))];
  const ok = await window.hs.exists(files);
  for (let i = 0; i < files.length; i++) {
    if (ok[i]) continue;
    const where = await window.hs.locate(baseName(files[i]));
    if (where) for (const c of P.clips) if (c.file === files[i]) c.file = where;
  }
  const still = await window.hs.exists(P.clips.filter((c) => c.kind === "audio").map((c) => c.file));
  const lost = P.clips.filter((c) => c.kind === "audio").filter((_, i) => !still[i]);
  if (lost.length) { P.clips = P.clips.filter((c) => !lost.includes(c)); toast(`${lost.length} bloc(s) retiré(s) : fichier introuvable`, 6000); }
  await analyzeAll(P.clips.filter((c) => c.kind === "audio").map((c) => c.file));
  afterLoad();
  fitAll();
  seek(0);
  dirty = false;
}
async function openProject() {
  try {
    const r = await window.hs.openProject();
    if (r) await loadProject(r.data, r.file);
  } catch (e) { toast("Projet illisible : " + e.message, 6000); }
}
async function saveProject(saveAs = false) {
  P.name = $("#projName").value.trim() || "Mon vocal";
  const f = await window.hs.saveProject(P, projectFile, saveAs);
  if (!f) return;
  projectFile = f;
  dirty = false;
  toast("Projet enregistré");
}
async function newProject2() {
  if (P.clips.length && dirty && (await ask("Nouveau projet", "Le projet actuel n'est pas enregistré. Il reste dans la sauvegarde automatique jusqu'à ta prochaine modification.", [[true, "Nouveau quand même", "cta"], [false, "Annuler", "ghost"]])) !== true) return;
  P = newProject();
  projectFile = null;
  History.undo = []; History.redo = [];
  pause(); seek(0);
  select(null);
  afterLoad();
  fitAll();
}

/* — Rafraîchir ce qui dépend du projet — */
function refresh() {
  const empty = !P.people.length && !P.clips.length;
  $("#emptyDrop").hidden = !empty;
  $("#bUndo").disabled = !History.undo.length;
  $("#bRedo").disabled = !History.redo.length;
  $("#tDur").textContent = fmt(duration(), false);
  document.querySelectorAll("#formatSeg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === P.format)));
  Scene.lastSent = "";
  renderInspector();
}
// Appelé à chaque modification (live = pendant un glisser : pas besoin de tout redessiner à droite)
window.onProjectChange = (live) => {
  $("#bUndo").disabled = !History.undo.length;
  $("#bRedo").disabled = !History.redo.length;
  $("#tDur").textContent = fmt(duration(), false);
  Scene.lastSent = "";
  if (!live) { refresh(); }
};
window.onSeek = () => { Scene.lastSent = ""; };

/* — Boucle : lecteurs, scène, timeline — */
function loop() {
  tickPlayer();
  const t = now();
  pushScene(t);
  followPlayhead();
  drawTimeline();
  $("#tNow").textContent = fmt(t);
  requestAnimationFrame(loop);
}

/* — Clavier — */
addEventListener("keydown", (e) => {
  const typing = e.target.closest("input[type=text], textarea, select") || (e.target.tagName === "INPUT" && e.target.type === "text");
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); return saveProject(e.shiftKey); }
  if (mod && e.key.toLowerCase() === "o") { e.preventDefault(); return openProject(); }
  if (typing) return;
  if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
  if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); return redo(); }
  if (e.key === " ") { e.preventDefault(); return toggle(); }
  if (e.key === "Home") return seek(0);
  if (e.key === "End") return seek(duration());
  if (e.key === "ArrowLeft") return seek(now() - (e.shiftKey ? 5 : 1 / 60));
  if (e.key === "ArrowRight") return seek(now() + (e.shiftKey ? 5 : 1 / 60));
  if (e.key === "Delete" || e.key === "Backspace") return deleteSelection();
  if (e.key.toLowerCase() === "s" && !mod) return cutAtPlayhead();
  if (e.key === "Escape") return select(null);
  if (/^[1-9]$/.test(e.key) && !e.repeat && !mod) return recKeyDown(+e.key);
  if (e.key === "+" || e.key === "=") return setZoom(zoomValue() + 0.08);
  if (e.key === "-") return setZoom(zoomValue() - 0.08);
});
addEventListener("keyup", (e) => { if (/^[1-9]$/.test(e.key)) recKeyUp(+e.key); });

/* — Glisser-déposer des fichiers sur la fenêtre — */
let dragDepth = 0;
addEventListener("dragenter", (e) => { if ([...e.dataTransfer.types].includes("Files")) { dragDepth++; $("#dropzone").hidden = false; } });
addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; $("#dropzone").hidden = true; } });
addEventListener("dragover", (e) => e.preventDefault());
addEventListener("drop", (e) => {
  e.preventDefault();
  dragDepth = 0;
  $("#dropzone").hidden = true;
  const paths = [...e.dataTransfer.files].map((f) => window.hs.pathOf(f)).filter(Boolean);
  const proj = paths.find((p) => p.endsWith(".hushstudio"));
  if (proj) return window.hs.openProject(proj).then((r) => r && loadProject(r.data, r.file));
  importPaths(paths);
});

/* — Boutons — */
$("#bImport").onclick = $("#bImport2").onclick = async () => importPaths(await window.hs.pickAudio());
$("#bManual").onclick = () => {
  checkpoint();
  addPerson({ name: "Personne 1" }); addPerson({ name: "Personne 2" });
  refresh();
  toast("Importe ton audio mélangé (choisis « Enregistrement mélangé »), puis maintiens 1, 2… pendant la lecture", 8000);
};
$("#bNew").onclick = newProject2;
$("#bOpen").onclick = openProject;
$("#bSave").onclick = () => saveProject(false);
$("#bUndo").onclick = undo;
$("#bRedo").onclick = redo;
$("#bPlay").onclick = toggle;
$("#bStart").onclick = () => seek(0);
$("#zoom").oninput = (e) => setZoom(+e.target.value);
$("#projName").addEventListener("change", () => { checkpoint(); P.name = $("#projName").value.trim() || "Mon vocal"; });
document.querySelectorAll("#formatSeg button").forEach((b) => (b.onclick = () => { if (P.format === b.dataset.v) return; checkpoint(); P.format = b.dataset.v; fitScene(); refresh(); }));
$("#bExport").onclick = () => openExport();
window.hs.onClosing(async () => {
  await window.hs.autosave({ project: P, file: projectFile });
  window.hs.confirmClose();
});

// L'export est branché par export.js s'il est présent
function openExport() {
  if (window.startExport) return window.startExport();
  ask("Export vidéo", "L'export arrive dans la prochaine version.", [[1, "OK", "cta"]]);
}

/* — Démarrage — */
(async function start() {
  initTimeline();
  await initScene();
  const saved = await window.hs.recover();
  if (saved && saved.project && saved.project.clips && saved.project.clips.length) {
    await loadProject(saved.project, saved.file || null);
    dirty = !saved.file;
    toast("Ton dernier projet a été rouvert");
  } else afterLoad();
  fitAll();
  requestAnimationFrame(loop);
  runTest();
})();

// Mode test (développement seulement, lancé avec HS_TEST_SHOT) : importe, se place, capture, quitte
async function runTest() {
  const info = await window.hs.test.info();
  if (!info) return;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    await wait(1500);
    if (info.import) { P = newProject(); afterLoad(); await importPaths([info.import]); }
    // Vérifications des gestes de montage
    const log = (m) => window.hs.test.log(m);
    const n0 = P.clips.length;
    seek(100); select(null); cutAtPlayhead();
    log(`couper sous la tête : ${n0} → ${P.clips.length} blocs (attendu ${n0 + P.people.length})`);
    undo(); log(`annuler : ${P.clips.length} blocs (attendu ${n0})`);
    redo(); log(`rétablir : ${P.clips.length} blocs`); undo();
    const c0 = P.clips[0]; select("clip", c0.id); deleteSelection();
    log(`effacer un bloc : ${P.clips.length} (attendu ${n0 - 1})`); undo();
    select("scene", P.scenes[0].id); splitScene(info.at + 2);
    const s2 = P.scenes[1]; s2.look.layout = "grid"; s2.look.bg = "space";
    log(`scènes : ${P.scenes.length} · ${P.scenes.map((s) => lookLabel(s.look)).join(" | ")}`);
    const st = sceneState(info.at);
    log(`état à ${info.at}s : ${st.members.map((m) => m.name + "=" + m.level + (m.speaking ? "*" : "")).join(" ")}`);
    seek(info.at);
    if (info.play) play();
    await wait(4000);
    await window.hs.test.shot();
    if (P.people[0]) { select("person", P.people[0].id); await wait(400); await window.hs.test.shot("person"); }
    select("scene", P.scenes[0].id); await wait(400); await window.hs.test.shot("scene");
    if (info.exportOut) { pause(); const f = await runExport(info.at, info.at + info.exportLen, info.exportOut, true); console.log("EXPORT " + f); }
  } catch (e) { console.error(e); }
  window.hs.test.quit();
}
