// Client minimal pour l'IPC local de Discord (le « RPC » officiel).
// Discord écoute sur un tube nommé \\?\pipe\discord-ipc-N (Windows) ou un socket Unix.
// Chaque trame = opcode (int32 LE) + longueur (int32 LE) + JSON.
const net = require("net");
const path = require("path");
const { EventEmitter } = require("events");
const { randomUUID } = require("crypto");

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };

// Emplacements possibles du tube : Windows, ou socket Unix (Mac, Linux ; sur Linux, Discord installé
// en Flatpak ou en Snap le range dans un sous-dossier)
function pipePaths(i) {
  if (process.platform === "win32") return [`\\\\?\\pipe\\discord-ipc-${i}`];
  const base = (process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || "/tmp").replace(/\/$/, "");
  return ["", "app/com.discordapp.Discord", "app/com.discordapp.DiscordCanary", "snap.discord", "snap.discord-canary"].map((d) => path.join(base, d, `discord-ipc-${i}`));
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
    for (let i = 0; i < 10 && !this.sock; i++) {
      for (const p of pipePaths(i)) {
        try { this.sock = await connectTo(p); break; } catch (e) { lastErr = e; }
      }
    }
    if (!this.sock) throw new Error("Discord n'est pas ouvert (aucun tube discord-ipc trouvé). " + (lastErr ? lastErr.code : ""));

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
