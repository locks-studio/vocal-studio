// Export vidéo : 1) ffmpeg mélange le son de tous les blocs (à l'échantillon près) ;
// 2) une fenêtre invisible affiche la scène Hush à la taille de la vidéo, image après image sur une horloge
// maîtrisée (export-preload.js) ; chaque image part dans ffmpeg, qui fabrique le MP4 (H.264 + AAC).
const { BrowserWindow, ipcMain, dialog, app, shell, screen } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { pathToFileURL } = require("url");
const { ffmpegPath } = require("./audio");

const SCENE_CSS = `
.titlebar,.dock,#music,.mp-grab,.loupes,.settings-wrap,.screen,.home,.call-banner,.incoming,#showHidden,#toast,
.mini-bar,.mini-grip,.screen-view,.share-pick,.onboard,#onboard,.chat,.chat-wrap,.set-search,.user-menu,.umenu{display:none!important}
.app{grid-template-rows:1fr!important;border-radius:0!important}
.stage{margin-bottom:0!important}
`;

let job = null;

function run(args, onErr) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), args, { windowsHide: true });
    let err = "";
    p.stderr.on("data", (d) => { err = (err + d).slice(-6000); if (onErr) onErr(String(d)); });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.trim().split("\n").slice(-3).join(" ")))));
    if (job) job.procs.push(p);
  });
}

// Le son : chaque bloc est découpé, décalé à sa place, mis à son volume, puis tout est mélangé
async function mixAudio(clips, length, out, tmpDir) {
  const args = ["-hide_banner", "-nostdin", "-y"];
  const parts = [];
  clips.forEach((c, i) => {
    args.push("-ss", c.in.toFixed(4), "-t", c.dur.toFixed(4), "-i", c.file);
    const ms = Math.round(c.delay * 1000);
    parts.push(`[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${c.gain.toFixed(3)},adelay=${ms}:all=1[a${i}]`);
  });
  let graph;
  if (!clips.length) graph = `anullsrc=r=48000:cl=stereo,atrim=0:${length.toFixed(3)}[out]`;
  else graph = parts.join(";\n") + ";\n" + clips.map((_, i) => `[a${i}]`).join("") +
    `amix=inputs=${clips.length}:normalize=0:dropout_transition=0,alimiter=limit=0.95:level=false,apad,atrim=0:${length.toFixed(3)}[out]`;
  // Le graphe passe par un fichier : pas de limite de longueur de ligne de commande, même avec 200 blocs
  const script = path.join(tmpDir, "mix.txt");
  fs.writeFileSync(script, graph);
  args.push("-filter_complex_script", script, "-map", "[out]", "-c:a", "aac", "-b:a", "192k", out);
  await run(args);
}

// La fenêtre invisible dessine en pixels réels de l'écran : avec une mise à l'échelle Windows (125 %, 150 %…),
// on la rend plus petite et on dézoome la page d'autant. Hush voit bien une page de 1920 px de large,
// et chaque image sort directement en 1920 × 1080, sans redimensionnement (sinon l'export est 3 fois plus lent).
function sceneWindow(W, H, sceneUrl) {
  const k = screen.getPrimaryDisplay().scaleFactor || 1;
  const w = new BrowserWindow({
    width: Math.round(W / k), height: Math.round(H / k), useContentSize: true, show: false, frame: false, paintWhenInitiallyHidden: true,
    backgroundColor: "#000000", enableLargerThanScreen: true,
    webPreferences: {
      offscreen: true, preload: path.join(__dirname, "export-preload.js"), contextIsolation: false, sandbox: false,
      nodeIntegration: false, partition: "persist:scene", backgroundThrottling: false, zoomFactor: 1 / k,
    },
  });
  w.webContents.setFrameRate(240);
  return new Promise((resolve, reject) => {
    w.webContents.once("did-fail-load", (_e, code, desc) => reject(new Error(desc)));
    w.webContents.once("dom-ready", async () => {
      try {
        await w.webContents.insertCSS(SCENE_CSS);
        w.setContentSize(Math.round(W / k), Math.round(H / k));
        w.webContents.setZoomFactor(1 / k);
        await w.webContents.executeJavaScript("window.__hsReady()");
        resolve(w);
      } catch (e) { reject(e); }
    });
    w.loadURL(sceneUrl);
  });
}

// Image suivante : on attend un vrai dessin de la fenêtre (événement « paint ») après avoir avancé l'horloge
function grab(w) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (img) => { if (done) return; done = true; clearTimeout(t); w.webContents.off("paint", onPaint); resolve(img); };
    const onPaint = (_e, _dirty, img) => finish(img);
    const t = setTimeout(() => w.webContents.capturePage().then(finish), 400);
    w.webContents.on("paint", onPaint);
    w.webContents.invalidate();
  });
}

function setup(getWin, sceneDir) {
  ipcMain.handle("export:pick", async (_e, name) => {
    const r = await dialog.showSaveDialog(getWin(), {
      title: "Exporter la vidéo",
      defaultPath: path.join(app.getPath("videos"), (name || "Hush Studio").replace(/[\\/:*?"<>|]+/g, "_") + ".mp4"),
      filters: [{ name: "Vidéo MP4", extensions: ["mp4"] }],
    });
    return r.canceled ? null : r.filePath;
  });

  ipcMain.handle("export:begin", async (_e, o) => {
    if (job) throw new Error("Un export est déjà en cours");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hush-studio-"));
    job = { procs: [], tmpDir, out: o.out, W: o.W, H: o.H, frames: 0, win: null, enc: null, cancelled: false, t0: Date.now(), tStep: 0, tGrab: 0, tWrite: 0 };
    try {
      const audio = path.join(tmpDir, "son.m4a");
      await mixAudio(o.clips, o.length, audio, tmpDir);
      if (job.cancelled) throw new Error("annulé");
      job.win = await sceneWindow(o.W, o.H, pathToFileURL(path.join(sceneDir, "index.html")).href);
      const enc = spawn(ffmpegPath(), [
        "-hide_banner", "-nostdin", "-y",
        "-f", "rawvideo", "-pix_fmt", "bgra", "-s", `${o.W}x${o.H}`, "-r", String(o.fps), "-i", "-",
        "-i", audio,
        "-map", "0:v", "-map", "1:a",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "copy", "-movflags", "+faststart", o.out,
      ], { windowsHide: true });
      let err = "";
      enc.stderr.on("data", (d) => (err = (err + d).slice(-6000)));
      enc.done = new Promise((res, rej) => enc.on("close", (code) => (code === 0 || job.cancelled ? res() : rej(new Error(err.trim().split("\n").slice(-3).join(" "))))));
      enc.stdin.on("error", () => {});
      job.enc = enc;
      job.procs.push(enc);
      return true;
    } catch (e) {
      cleanup();
      throw e;
    }
  });

  // Une image : l'état du vocal + le style, l'horloge avance de 1/fps, on capture, on envoie à ffmpeg
  ipcMain.handle("export:frame", async (_e, state, look, dtMs, warmup) => {
    if (!job || job.cancelled) throw new Error("annulé");
    const a = performance.now();
    await job.win.webContents.executeJavaScript(`window.__hsFrame(${JSON.stringify(state)}, ${JSON.stringify(look)}, ${dtMs})`);
    if (warmup) return true; // images de mise en route : Hush se met en place, rien n'est enregistré
    const b = performance.now();
    let img = await grab(job.win);
    const c = performance.now();
    if (process.env.HS_TEST_SHOT && !job.logged) { job.logged = true; fs.writeFileSync(path.join(path.dirname(process.env.HS_TEST_SHOT), "imginfo.txt"), JSON.stringify({ size: img.getSize() })); }
    job.tStep += b - a; job.tGrab += c - b;
    const sz = img.getSize();
    if (sz.width !== job.W || sz.height !== job.H) img = img.resize({ width: job.W, height: job.H, quality: "best" });
    const buf = img.toBitmap();
    const d = performance.now();
    job.tBitmap = (job.tBitmap || 0) + d - c;
    job.frames++;
    if (!job.enc.stdin.write(buf)) await new Promise((r) => job.enc.stdin.once("drain", r));
    job.tWrite += performance.now() - c;
    return true;
  });

  ipcMain.handle("export:end", async () => {
    if (!job) return null;
    const { enc, out } = job;
    enc.stdin.end();
    if (process.env.HS_TEST_SHOT) {
      const n = Math.max(1, job.frames);
      fs.writeFileSync(path.join(path.dirname(process.env.HS_TEST_SHOT), "timing.txt"),
        `images ${job.frames} · total ${((Date.now() - job.t0) / 1000).toFixed(1)} s · étape ${(job.tStep / n).toFixed(1)} ms · capture ${(job.tGrab / n).toFixed(1)} ms · écriture ${(job.tWrite / n).toFixed(1)} ms (dont toBitmap ${((job.tBitmap || 0) / n).toFixed(1)} ms)
`);
    }
    try { await enc.done; } finally { cleanup(); }
    return out;
  });

  ipcMain.handle("export:cancel", async () => {
    if (!job) return;
    job.cancelled = true;
    for (const p of job.procs) { try { p.kill(); } catch {} }
    const out = job.out;
    cleanup();
    setTimeout(() => { try { fs.unlinkSync(out); } catch {} }, 500);
  });

  ipcMain.handle("export:show", (_e, f) => shell.showItemInFolder(f));
}

function cleanup() {
  if (!job) return;
  try { if (job.win && !job.win.isDestroyed()) job.win.destroy(); } catch {}
  try { fs.rmSync(job.tmpDir, { recursive: true, force: true }); } catch {}
  job = null;
}

module.exports = { setup };
