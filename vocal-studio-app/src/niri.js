// niri (Linux) : l'overlay suit tous les bureaux.
// niri n'a pas encore de fenêtre « épinglée sur tous les bureaux ». On fait comme les outils de la communauté
// (niri-float-sticky) : on écoute niri par sa socket (NIRI_SOCKET) et, à chaque changement de bureau, on y déplace
// l'overlay, sans lui donner le focus. Rien à installer ; ne fait rien hors de niri.
const net = require("net");

class NiriSticky {
  constructor(title) {
    this.title = title;
    this.sock = null;
    this.win = null; // { id, workspace_id }
    this.stopped = true;
  }

  get available() { return process.platform === "linux" && !!process.env.NIRI_SOCKET; }

  start() {
    if (!this.available || !this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    this.win = null;
    if (this.sock) { try { this.sock.destroy(); } catch {} this.sock = null; }
  }

  connect() {
    if (this.stopped) return;
    const s = net.createConnection(process.env.NIRI_SOCKET);
    this.sock = s;
    let buf = "";
    s.on("connect", () => s.write('"EventStream"\n'));
    s.on("data", (d) => {
      buf += d.toString("utf8");
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) { try { this.onEvent(JSON.parse(line)); } catch {} }
      }
    });
    s.on("error", () => {});
    // niri redémarré ou socket coupée : on se reconnecte tant que l'overlay est ouvert
    s.on("close", () => { if (!this.stopped) setTimeout(() => this.connect(), 2000); });
  }

  isMine(w) { return w && w.title === this.title; }

  onEvent(e) {
    if (e.WindowsChanged) {
      const w = (e.WindowsChanged.windows || []).find((x) => this.isMine(x));
      if (w) this.win = { id: w.id, workspace_id: w.workspace_id };
    } else if (e.WindowOpenedOrChanged) {
      const w = e.WindowOpenedOrChanged.window;
      if (this.isMine(w)) this.win = { id: w.id, workspace_id: w.workspace_id };
    } else if (e.WindowClosed) {
      if (this.win && e.WindowClosed.id === this.win.id) this.win = null;
    } else if (e.WorkspaceActivated && e.WorkspaceActivated.focused) {
      const ws = e.WorkspaceActivated.id;
      if (this.win && this.win.workspace_id !== ws) this.moveTo(ws);
    }
  }

  // Une demande à niri sur une connexion à part (celle des évènements reste ouverte)
  moveTo(workspaceId) {
    const req = { Action: { MoveWindowToWorkspace: { window_id: this.win.id, reference: { Id: workspaceId }, focus: false } } };
    const c = net.createConnection(process.env.NIRI_SOCKET);
    c.on("connect", () => c.end(JSON.stringify(req) + "\n"));
    c.on("data", () => c.destroy());
    c.on("error", () => {});
    this.win.workspace_id = workspaceId;
  }
}

module.exports = { NiriSticky };
