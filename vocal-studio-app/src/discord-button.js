// Bouton « Hush » accroché à la fenêtre de Discord (Windows) : une petite pastille posée sur la barre de titre de
// Discord, attachée à elle (jamais par-dessus une autre fenêtre). Un clic ouvre Hush ; on peut la glisser de gauche à
// droite pour la placer où elle gêne le moins (sa place est gardée).
// La position de Discord est lue par un petit PowerShell qui tourne en fond (pas de module natif à compiler).
const { BrowserWindow, screen } = require("electron");
const { spawn } = require("child_process");

const W = 86, H = 22;
// Lit toutes les 250 ms : la fenêtre principale de Discord, sa place (pixels réels), si elle est réduite et au premier plan
const PS = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System; using System.Runtime.InteropServices;
public class HushW {
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Ri, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[HushW]::SetProcessDPIAware() | Out-Null
$h = [IntPtr]::Zero; $n = 0
while ($true) {
  # Hush fermé (même brutalement) : on s'arrête aussi
  if (($n % 20) -eq 0 -and -not (Get-Process -Id __PARENT__ -ErrorAction SilentlyContinue)) { exit }
  if ($h -eq [IntPtr]::Zero -or ($n++ % 20) -eq 0) {
    $p = Get-Process Discord,DiscordPTB,DiscordCanary -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    $h = if ($p) { $p.MainWindowHandle } else { [IntPtr]::Zero }
  }
  if ($h -eq [IntPtr]::Zero) { [Console]::Out.WriteLine("none") }
  else {
    $r = New-Object HushW+R
    [HushW]::GetWindowRect($h, [ref]$r) | Out-Null
    $fg = [HushW]::GetForegroundWindow() -eq $h
    [Console]::Out.WriteLine("$($r.L) $($r.T) $($r.Ri) $($r.B) $([int]$fg) $([int][HushW]::IsIconic($h)) $([int][HushW]::IsZoomed($h)) $([int64]$h)")
  }
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 250
}
`;

class DiscordButton {
  // opts : { icon, onOpen(), getFrac(), setFrac(f) }
  constructor(opts) { this.o = opts; this.proc = null; this.win = null; this.on = false; this.last = null; this.hideT = null; }

  start() {
    if (process.platform !== "win32" || this.on) return;
    this.on = true;
    this.spawn();
    this.focuser(); // prêt d'avance pour « Aller sur Discord »
  }
  // Met la fenêtre de Discord au premier plan (elle s'ouvre si elle était réduite)
  // Ramène la fenêtre de Discord devant. Un PowerShell reste prêt en fond (code déjà compilé) : le clic est instantané,
  // au lieu de démarrer PowerShell et de recompiler à chaque fois (1 à 2 s).
  focusDiscord() {
    if (process.platform !== "win32") return Promise.resolve(false);
    const f = this.focuser();
    if (!f) return Promise.resolve(false);
    return new Promise((res) => {
      const t = setTimeout(() => { f.wait = null; res(false); }, 4000);
      f.wait = (ok) => { clearTimeout(t); res(ok); };
      try { f.p.stdin.write("f\n"); } catch { clearTimeout(t); res(false); }
    });
  }
  focuser() {
    if (this.fz && !this.fz.p.killed && this.fz.p.exitCode === null) return this.fz;
    const ps = `$ErrorActionPreference='SilentlyContinue'
Add-Type @"
using System; using System.Runtime.InteropServices;
public class HushF { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c); [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h); [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, int f, int e); }
"@
[Console]::Out.WriteLine('ready'); [Console]::Out.Flush()
while ($true) {
  $l = [Console]::In.ReadLine(); if ($l -eq $null) { exit }
  $p = Get-Process Discord,DiscordPTB,DiscordCanary | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if ($p) {
    $h = $p.MainWindowHandle
    if ([HushF]::IsIconic($h)) { [HushF]::ShowWindow($h, 9) | Out-Null }
    [HushF]::keybd_event(0x12, 0, 0, 0); [HushF]::keybd_event(0x12, 0, 2, 0)
    [HushF]::SetForegroundWindow($h) | Out-Null
    [Console]::Out.WriteLine('ok')
  } else { [Console]::Out.WriteLine('none') }
  [Console]::Out.Flush()
}`;
    try {
      const p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(ps, "utf16le").toString("base64")], { windowsHide: true });
      const fz = { p, wait: null };
      let buf = "";
      p.stdout.on("data", (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if ((line === "ok" || line === "none") && fz.wait) { const w = fz.wait; fz.wait = null; w(line === "ok"); }
        }
      });
      p.on("error", () => { if (fz.wait) fz.wait(false); });
      p.on("exit", () => { if (fz.wait) fz.wait(false); if (this.fz === fz) this.fz = null; });
      this.fz = fz;
      return fz;
    } catch { return null; }
  }
  stop() {
    this.on = false;
    if (this.fz) { try { this.fz.p.kill(); } catch {} this.fz = null; }
    if (this.proc) { try { this.proc.kill(); } catch {} this.proc = null; }
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }

  spawn() {
    if (!this.on) return;
    const enc = Buffer.from(PS.replace("__PARENT__", String(process.pid)), "utf16le").toString("base64");
    const p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc], { windowsHide: true });
    this.proc = p;
    let buf = "";
    p.stdout.on("data", (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf("\n")) >= 0) { this.line(buf.slice(0, i).trim()); buf = buf.slice(i + 1); }
    });
    p.on("exit", () => { if (this.proc === p) { this.proc = null; this.hide(); if (this.on) setTimeout(() => this.spawn(), 5000); } });
    p.on("error", () => {});
  }

  line(l) {
    if (!l || l === "none") return this.hide();
    let [L, T, R, B, fg, min, zoomed, hwnd] = l.split(" ").map(Number);
    // Fenêtre agrandie : Windows la fait dépasser de 8 px de chaque côté, hors de l'écran
    if (zoomed) { L += 8; T += 8; R -= 8; B -= 8; }
    // Seulement quand Discord est la fenêtre active : jamais par-dessus un jeu ou une autre appli
    // (la pastille ne prend jamais le focus, donc un clic dessus laisse Discord au premier plan)
    if (min || !fg || R - L < 300) return this.hide();
    this.lastHwnd = hwnd;
    if (hwnd && this.win && this.owner !== hwnd) this.setOwner(hwnd);
    this.dw = (R - L) / (screen.getPrimaryDisplay().scaleFactor || 1);
    // Pixels réels → pixels de l'écran d'Electron
    let r = { x: L, y: T, width: R - L, height: B - T };
    try { r = screen.screenToDipRect(null, r); } catch {}
    const frac = Math.max(0.05, Math.min(0.95, this.o.getFrac()));
    // Sur la barre de titre de Discord, à l'endroit choisi, 15 px plus bas que le haut de la fenêtre
    const x = Math.round(r.x + (r.width - this.w()) * frac), y = Math.round(r.y + 6);
    this.show({ x, y });
  }

  ensure() {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const win = new BrowserWindow({
      width: this.w(), height: H, show: false, frame: false, transparent: true, resizable: false, movable: false, focusable: false,
      skipTaskbar: true, alwaysOnTop: false, hasShadow: false, backgroundColor: "#00000000", icon: this.o.icon,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(page(this.style())));
    // Un clic : on ouvre Hush. Glisser : on déplace la pastille le long de la barre de titre
    win.webContents.on("console-message", (_e, _lvl, msg) => {
      if (msg === "hush:open") this.o.onOpen();
      else if (msg.startsWith("hush:drag:")) {
        // Place gardée en fraction de la largeur de Discord : elle suit la fenêtre quand on la redimensionne
        const dx = Number(msg.slice(10)) || 0;
        this.o.setFrac(Math.max(0.05, Math.min(0.95, this.o.getFrac() + dx / Math.max(400, (this.dw || 800) - this.w()))));
      }
    });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (e) => e.preventDefault());
    this.win = win;
    return win;
  }

  // Windows : notre fenêtre devient une fenêtre « possédée » par celle de Discord (même place dans la pile)
  setOwner(hwnd) {
    this.owner = hwnd;
    let mine;
    try { const b = this.win.getNativeWindowHandle(); mine = b.length >= 8 ? b.readBigInt64LE(0) : BigInt(b.readInt32LE(0)); } catch { return; }
    const ps = `Add-Type @"
using System; using System.Runtime.InteropServices;
public class HushO { [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW")] public static extern IntPtr SetOwner(IntPtr h, int i, IntPtr v); }
"@
[HushO]::SetOwner([IntPtr]${mine}, -8, [IntPtr]${hwnd}) | Out-Null`;
    try { spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(ps, "utf16le").toString("base64")], { windowsHide: true }).on("error", () => {}); } catch {}
  }
  show(p) {
    clearTimeout(this.hideT);
    const win = this.ensure();
    if (!this.last || this.last.x !== p.x || this.last.y !== p.y) win.setBounds({ x: p.x, y: p.y, width: this.w(), height: H });
    this.last = p;
    if (!win.isVisible()) { win.showInactive(); if (this.lastHwnd) this.setOwner(this.lastHwnd); }
  }
  style() { return { shape: "pill", c1: "#ff4fa3", c2: "#a35cff", ...((this.o.getStyle && this.o.getStyle()) || {}) }; }
  // Largeur selon la forme : « Rond » n'a que le point, pas le texte
  w() { return this.style().shape === "round" ? H : W; }
  // Nouvelle forme ou nouvelles couleurs : on refait la pastille
  restyle() {
    if (this.win && !this.win.isDestroyed()) {
      const vis = this.win.isVisible(), p = this.last;
      this.win.destroy(); this.win = null; this.last = null;
      if (vis && p) this.show(p);
    }
  }
  hide() {
    // Petit délai : un clic sur la pastille rend Discord « pas au premier plan » une fraction de seconde
    clearTimeout(this.hideT);
    this.hideT = setTimeout(() => { if (this.win && !this.win.isDestroyed() && this.win.isVisible()) this.win.hide(); this.last = null; }, 150);
  }
}

const page = (st) => `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
html,body{margin:0;height:100%;background:transparent;overflow:hidden;user-select:none;font:700 12px "Segoe UI",system-ui,sans-serif}
button{all:unset;box-sizing:border-box;width:100%;height:100%;display:flex;align-items:center;justify-content:center;gap:6px;border-radius:999px;cursor:pointer;color:#fff;
  background:linear-gradient(135deg,${st.c1},${st.c2});box-shadow:inset 0 1px 0 rgba(255,255,255,.45),0 1px 4px rgba(0,0,0,.35);transition:filter .15s}
body.soft button{border-radius:6px}
body.round button{border-radius:50%}
body.round b{display:none}
body.outline button{border:2px solid transparent;background:linear-gradient(#1e1f22,#1e1f22) padding-box,linear-gradient(135deg,${st.c1},${st.c2}) border-box;box-shadow:0 1px 4px rgba(0,0,0,.35)}
body.outline i{background:linear-gradient(135deg,${st.c1},${st.c2});box-shadow:0 0 6px ${st.c1}}
button:hover{filter:brightness(1.12)}
button:active{filter:brightness(.92)}
i{width:7px;height:7px;border-radius:50%;background:#fff;box-shadow:0 0 6px #fff}
</style></head><body class="${st.shape}"><button title="Ouvrir Hush · glisser pour déplacer"><i></i><b>Hush</b></button>
<script>
const b = document.querySelector("button");
let down = null, moved = false;
b.addEventListener("pointerdown", (e) => { down = e.screenX; moved = false; b.setPointerCapture(e.pointerId); });
b.addEventListener("pointermove", (e) => { if (down == null) return; const dx = e.screenX - down; if (Math.abs(dx) > 3) { moved = true; down = e.screenX; console.log("hush:drag:" + dx); } });
b.addEventListener("pointerup", () => { if (down != null && !moved) console.log("hush:open"); down = null; });
</script></body></html>`;

module.exports = { DiscordButton };
