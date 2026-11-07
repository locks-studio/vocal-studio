// Essai réel : ouvre Hush et le launcher dans un dossier de données vide, et vérifie que la page s'affiche,
// que le style est bien chargé et qu'aucune erreur JavaScript n'apparaît au démarrage.
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const WebSocket = require(path.join(ROOT, "vocal-studio-app/node_modules/ws"));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(name, dir, port, expr) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "hush-smoke-"));
  const exe = path.join(ROOT, dir, "node_modules/electron/dist", process.platform === "win32" ? "electron.exe" : process.platform === "darwin" ? "Electron.app/Contents/MacOS/Electron" : "electron");
  const app = spawn(exe, [".", `--remote-debugging-port=${port}`, `--user-data-dir=${data}`, "--no-sandbox"], { cwd: path.join(ROOT, dir), stdio: "ignore" });
  try {
    let page = null;
    for (let i = 0; i < 40 && !page; i++) {
      await wait(500);
      try { page = (await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json())).find((t) => t.type === "page" && t.url.includes("index.html")); } catch {}
    }
    if (!page) throw new Error(`${name} : la page ne s'ouvre pas`);
    const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
    let id = 0;
    const calls = new Map(), errors = [];
    const call = (method, params) => new Promise((res) => { const i = ++id; calls.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    ws.on("message", (m) => {
      const r = JSON.parse(m);
      if (calls.has(r.id)) { calls.get(r.id)(r); calls.delete(r.id); }
      if (r.method === "Runtime.exceptionThrown") errors.push(r.params.exceptionDetails.exception ? r.params.exceptionDetails.exception.description : r.params.exceptionDetails.text);
      if (r.method === "Log.entryAdded" && r.params.entry.level === "error" && r.params.entry.url && r.params.entry.url.startsWith("file:")) errors.push(`${r.params.entry.text} ${r.params.entry.url}`);
    });
    await new Promise((r) => ws.on("open", r));
    await call("Runtime.enable", {}); await call("Log.enable", {});
    await call("Page.reload", {});
    await wait(4000);
    const r = await call("Runtime.evaluate", { expression: expr, returnByValue: true });
    const v = r.result.result && r.result.result.value;
    if (v !== true) throw new Error(`${name} : contrôle de la page échoué (${JSON.stringify(v)})`);
    if (errors.length) throw new Error(`${name} : ${errors[0]}`);
    console.log(`  ${name} : démarre sans erreur`);
    ws.close();
  } finally {
    app.kill();
    await wait(800);
    try { fs.rmSync(data, { recursive: true, force: true, maxRetries: 3 }); } catch {}
  }
}

(async () => {
  // Le style est chargé si la barre de titre est bien en grille / flex ; sinon la page est brute (le bug du style.css vide)
  const styled = 'getComputedStyle(document.querySelector(".titlebar")).display === "flex"';
  await run("Hush", "vocal-studio-app", 9391, `${styled} && document.querySelectorAll("button").length > 20 && typeof state === "object"`);
  await run("Launcher", "launcher", 9392, `${styled} && !!document.querySelector("#playBtn")`);
})().catch((e) => { console.error(e.message); process.exit(1); });
