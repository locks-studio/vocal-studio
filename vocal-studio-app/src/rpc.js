// Client minimal pour l'IPC local de Discord (le « RPC » officiel).
// Discord écoute sur un tube nommé \\?\pipe\discord-ipc-N (Windows) ou un socket Unix.
// Chaque trame = opcode (int32 LE) + longueur (int32 LE) + JSON.
const net = require("net");
const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");
const { randomUUID } = require("crypto");

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };

// Dossiers où Discord peut ranger son socket sur Mac / Linux
function unixRoots() {
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  const roots = [process.env.XDG_RUNTIME_DIR, uid !== null ? `/run/user/${uid}` : null, process.env.TMPDIR, process.env.TMP, process.env.TEMP, "/tmp"];
  return [...new Set(roots.filter(Boolean).map((r) => r.replace(/\/$/, "")))];
}

// Cherche tous les sockets « discord-ipc-N » : à la racine de ces dossiers ou un peu plus bas.
// Discord en Flatpak (app/com.discordapp.Discord, ou .flatpak/<id>/xdg-run selon la version), en Snap (snap.discord)…
// L'emplacement change d'une installation à l'autre : on le trouve plutôt que de le deviner.
function findUnixSockets() {
  const found = [];
  const walk = (dir, depth) => {
    let list;
    try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      const p = path.join(dir, e.name);
      if (/^discord-ipc-\d+$/.test(e.name)) found.push(p);
      else if (depth > 0 && e.isDirectory() && !e.isSymbolicLink()) walk(p, depth - 1);
    }
  };
  for (const r of unixRoots()) walk(r, 3);
  // Le n° 0 d'abord (c'est le premier Discord lancé), puis 1, 2…
  return [...new Set(found)].sort((a, b) => Number(a.match(/(\d+)$/)[1]) - Number(b.match(/(\d+)$/)[1]));
}

function pipePaths() {
  if (process.platform === "win32") return Array.from({ length: 10 }, (_, i) => `\\\\?\\pipe\\discord-ipc-${i}`);
  return findUnixSockets();
}

function connectTo(p) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(p);
    sock.once("connect", () => resolve(sock));
    sock.once("error", reject);
  });
}

class DiscordIPC extends EventEmitter {
  constructor(clientId) {
    super();
    this.clientId = clientId;
    this.sock = null;
    this.buf = Buffer.alloc(0);
    this.pending = new Map();
  }

  async connect() {
    let lastErr;
    const paths = pipePaths();
    for (const p of paths) {
      try { this.sock = await connectTo(p); break; } catch (e) { lastErr = e; }
    }
    if (!this.sock) {
      // Message qui dit ce qui a été cherché, pour comprendre tout de suite où ça coince
      const where = process.platform === "win32" ? "" : paths.length
        ? ` Trouvé mais refusé : ${paths.join(", ")} (${lastErr ? lastErr.code : "?"}).`
        : ` Cherché dans : ${unixRoots().join(", ")}.`;
      throw new Error("Discord n'est pas ouvert (aucun tube discord-ipc trouvé)." + where);
    }

    this.sock.on("data", (d) => this._onData(d));
    this.sock.on("close", () => this._onClose("Connexion à Discord fermée."));
    this.sock.on("error", (e) => this._onClose(e.message));

    const ready = new Promise((resolve, reject) => {
      this.once("ready", resolve);
      this.once("closed", (reason) => reject(new Error(reason)));
    });
    this._send(OP.HANDSHAKE, { v: 1, client_id: this.clientId });
    return ready;
  }

  request(cmd, args = {}, evt) {
    return new Promise((resolve, reject) => {
      const nonce = randomUUID();
      this.pending.set(nonce, { resolve, reject, cmd });
      this._send(OP.FRAME, { cmd, args, evt, nonce });
    });
  }

  subscribe(evt, args = {}) {
    return this.request("SUBSCRIBE", args, evt);
  }

  unsubscribe(evt, args = {}) {
    return this.request("UNSUBSCRIBE", args, evt).catch(() => {});
  }

  close() {
    if (!this.sock) return;
    try { this._send(OP.CLOSE, {}); } catch {}
    this.sock.destroy();
  }

  _send(op, data) {
    const json = Buffer.from(JSON.stringify(data), "utf8");
    const head = Buffer.alloc(8);
    head.writeInt32LE(op, 0);
    head.writeInt32LE(json.length, 4);
    this.sock.write(Buffer.concat([head, json]));
  }

  _onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (this.buf.length >= 8) {
      const op = this.buf.readInt32LE(0);
      const len = this.buf.readInt32LE(4);
      if (this.buf.length < 8 + len) return;
      const raw = this.buf.subarray(8, 8 + len).toString("utf8");
      this.buf = this.buf.subarray(8 + len);
      let msg;
      try { msg = JSON.parse(raw); } catch { continue; }
      this._onMessage(op, msg);
    }
  }

  _onMessage(op, msg) {
    if (op === OP.PING) return this._send(OP.PONG, msg);
    if (op === OP.CLOSE) return this._onClose(msg.message || "Discord a refusé la connexion.");
    if (msg.cmd === "DISPATCH") {
      if (msg.evt === "READY") return this.emit("ready", msg.data);
      return this.emit("event", msg.evt, msg.data);
    }
    const p = this.pending.get(msg.nonce);
    if (!p) return;
    this.pending.delete(msg.nonce);
    if (msg.evt === "ERROR") p.reject(new Error(`${p.cmd} : ${msg.data && msg.data.message}`));
    else p.resolve(msg.data);
  }

  _onClose(reason) {
    if (this.closedOnce) return;
    this.closedOnce = true;
    for (const p of this.pending.values()) p.reject(new Error(reason));
    this.pending.clear();
    this.emit("closed", reason);
  }
}

module.exports = { DiscordIPC };
