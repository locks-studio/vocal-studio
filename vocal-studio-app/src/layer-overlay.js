// Linux (Wayland) : l'overlay sur la couche « overlay » du bureau, devant tout, même le plein écran.
// Une fenêtre Electron ne peut pas y aller : sous niri, une appli en plein écran passe devant les fenêtres
// flottantes. Hush dessine donc l'overlay hors écran (offscreen) et layer-overlay.py l'affiche sur cette couche,
// avec GTK et gtk-layer-shell. S'ils ne sont pas installés, Hush garde la mini-fenêtre normale.
const { spawn, spawnSync } = require("child_process");
const path = require("path");

const SCRIPT = path.join(__dirname, "layer-overlay.py").replace("app.asar", "app.asar.unpacked");

let supported = null;
// Vérifié une seule fois : Wayland, python3, GTK 3 et gtk-layer-shell, et un bureau qui accepte layer-shell
function layerSupported() {
  if (supported !== null) return supported;
  supported = false;
  if (process.platform !== "linux" || !process.env.WAYLAND_DISPLAY) return supported;
  const check = "import gi;gi.require_version('Gtk','3.0');gi.require_version('GtkLayerShell','0.1');"
    + "from gi.repository import Gtk,GtkLayerShell;import cairo;print(GtkLayerShell.is_supported())";
  const r = spawnSync("python3", ["-I", "-c", check], { encoding: "utf8", timeout: 5000 });
  supported = r.status === 0 && String(r.stdout).trim() === "True";
  return supported;
}

class LayerOverlay {
  constructor() {
    this.proc = null;
    this.editing = false;
  }

  // onMessage : ce que renvoie le programme en mode « Déplacer » ({ x, y, w, h } ou { edit: false })
  start(onExit, onMessage) {
    this.proc = spawn("python3", ["-I", SCRIPT], { stdio: ["pipe", "pipe", "ignore"] });
    this.proc.stdin.on("error", () => {});
    let buf = "";
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("{")) continue;
        try {
          const m = JSON.parse(line);
          if (m.edit === false) this.editing = false;
          if (onMessage) onMessage(m);
        } catch {}
      }
    });
    this.proc.on("exit", () => { this.proc = null; if (onExit) onExit(); });
  }

  edit(on) {
    this.editing = !!on;
    this.send("J", Buffer.from(JSON.stringify({ edit: this.editing })));
  }

  send(kind, body) {
    if (!this.proc || !this.proc.stdin.writable) return;
    // Le programme n'a pas encore affiché l'image précédente : on saute celle-ci plutôt que d'en empiler
    if (kind === "F" && this.proc.stdin.writableLength > 4 << 20) return;
    const head = Buffer.alloc(5);
    head.write(kind, 0, "latin1");
    head.writeUInt32LE(body.length, 1);
    this.proc.stdin.write(Buffer.concat([head, body]));
  }

  // b : { x, y, width, height } sur l'écran d ({ x, y } : son coin haut gauche)
  place(b, d) {
    this.send("J", Buffer.from(JSON.stringify({ x: b.x - d.x, y: b.y - d.y, w: b.width, h: b.height, screen: { x: d.x, y: d.y } })));
  }

  // image : la NativeImage de l'évènement « paint » (pixels BGRA prémultipliés, comme le veut cairo)
  frame(image) {
    const { width, height } = image.getSize();
    if (!width || !height) return;
    const head = Buffer.alloc(8);
    head.writeUInt32LE(width, 0);
    head.writeUInt32LE(height, 4);
    this.send("F", Buffer.concat([head, image.toBitmap()]));
  }

  stop() {
    if (this.proc) { try { this.proc.stdin.end(); } catch {} }
  }
}

module.exports = { LayerOverlay, layerSupported };
