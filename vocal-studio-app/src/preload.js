const { contextBridge, ipcRenderer, webFrame } = require("electron");

contextBridge.exposeInMainWorld("studio", {
  // Zoom de la page (Ctrl + / Ctrl −) : le menu clic droit le compense pour garder sa taille
  pageZoom: () => webFrame.getZoomFactor(),
  config: {
    get: () => ipcRenderer.invoke("config:get"),
    save: (c) => ipcRenderer.invoke("config:save", c),
    logout: () => ipcRenderer.invoke("config:logout"),
  },
  bot: {
    login: () => ipcRenderer.invoke("bot:login"),
    info: () => ipcRenderer.invoke("bot:info"),
  },
  voice: {
    start: () => ipcRenderer.invoke("voice:start"),
    stop: () => ipcRenderer.invoke("voice:stop"),
    state: () => ipcRenderer.invoke("voice:state"),
    mute: (v) => ipcRenderer.invoke("voice:mute", v),
    deaf: (v) => ipcRenderer.invoke("voice:deaf", v),
    leave: () => ipcRenderer.invoke("voice:leave"),
    summon: () => ipcRenderer.invoke("voice:summon"),
    join: (c, g) => ipcRenderer.invoke("voice:join", c, g),
    user: (a) => ipcRenderer.invoke("voice:user", a),
    home: () => ipcRenderer.invoke("voice:home"),
    openChannel: (g, c) => ipcRenderer.invoke("discord:channel", g, c),
    openProfile: (id) => ipcRenderer.invoke("discord:user", id),
    copy: (text) => ipcRenderer.invoke("clip:write", text),
    paste: () => ipcRenderer.invoke("clip:read"),
    onState: (fn) => ipcRenderer.on("voice:state", (_e, s) => fn(s)),
  },
  music: {
    source: (src) => ipcRenderer.invoke("music:source", src),
    volume: (v) => ipcRenderer.invoke("music:volume", v),
    control: (cmd) => ipcRenderer.invoke("music:control", cmd),
    onState: (fn) => ipcRenderer.on("music:state", (_e, s) => fn(s)),
  },
  sounds: {
    list: () => ipcRenderer.invoke("sounds:list"),
    add: () => ipcRenderer.invoke("sounds:add"),
    attachLrc: (id) => ipcRenderer.invoke("sounds:lrc", id),
    remove: (id) => ipcRenderer.invoke("sounds:remove", id),
    setCover: (id) => ipcRenderer.invoke("sounds:cover", id),
    record: (data, duration) => ipcRenderer.invoke("sounds:record", data, duration),
    rename: (id, title) => ipcRenderer.invoke("sounds:rename", id, title),
  },
  bg: {
    pick: () => ipcRenderer.invoke("bg:pick"),
  },
  lyrics: {
    get: (q) => ipcRenderer.invoke("lyrics:get", q),
  },
  cover: {
    find: (q) => ipcRenderer.invoke("cover:find", q),
  },
  spotify: {
    get: () => ipcRenderer.invoke("spotify:get"),
    save: (clientId) => ipcRenderer.invoke("spotify:save", clientId),
    login: () => ipcRenderer.invoke("spotify:login"),
    logout: () => ipcRenderer.invoke("spotify:logout"),
  },
  video: {
    state: (v) => ipcRenderer.send("video:state", v),
    rtc: (to, data) => ipcRenderer.send("video:rtc", to, data),
    onSignal: (fn) => ipcRenderer.on("video:signal", (_e, m) => fn(m)),
  },
  capture: {
    sources: () => ipcRenderer.invoke("capture:sources"),
    pick: (p) => ipcRenderer.invoke("capture:pick", p),
  },
  clip: {
    begin: () => ipcRenderer.invoke("clip:begin"),
    chunk: (id, buf) => ipcRenderer.invoke("clip:chunk", id, buf),
    end: (id) => ipcRenderer.invoke("clip:end", id),
    show: (file) => ipcRenderer.invoke("clip:show", file),
  },
  report: {
    error: (r) => ipcRenderer.send("report:error", r),
    consent: (on) => ipcRenderer.send("report:consent", on),
    copy: () => ipcRenderer.invoke("report:copy"),
  },
  admin: (op) => ipcRenderer.invoke("admin:op", op),
  account: {
    remove: () => ipcRenderer.invoke("account:delete"),
    privacy: () => ipcRenderer.invoke("open:privacy"),
  },
  friends: {
    op: (op, arg) => ipcRenderer.invoke("friends:op", op, arg),
    presence: (voice) => ipcRenderer.send("friends:presence", voice),
    onChanged: (fn) => ipcRenderer.on("friends:changed", () => fn()),
    onInvite: (fn) => ipcRenderer.on("friends:invite", (_e, inv) => fn(inv)),
  },
  chat: {
    history: () => ipcRenderer.invoke("chat:history"),
    send: (text) => ipcRenderer.invoke("chat:send", text),
    onMessage: (fn) => ipcRenderer.on("chat:message", (_e, m) => fn(m)),
  },
  usage: {
    me: () => ipcRenderer.invoke("usage:me"),
    top: () => ipcRenderer.invoke("usage:top"),
  },
  linux: {
    info: () => ipcRenderer.invoke("linux:info"),
    setMode: (m) => ipcRenderer.invoke("linux:mode", m),
  },
  win: {
    minimize: () => ipcRenderer.invoke("win:minimize"),
    maximize: () => ipcRenderer.invoke("win:maximize"),
    close: () => ipcRenderer.invoke("win:close"),
    reload: () => ipcRenderer.invoke("win:reload"),
    pin: (on) => ipcRenderer.invoke("win:pin", on),
    fullscreen: () => ipcRenderer.invoke("win:fullscreen"),
    mini: () => ipcRenderer.invoke("win:mini"),
    drag: (phase, mode) => ipcRenderer.send("win:drag", phase, mode),
    focusMain: () => ipcRenderer.invoke("win:main"),
    onMini: (fn) => ipcRenderer.on("win:mini", (_e, open) => fn(open)),
    overlay: (cfg) => ipcRenderer.invoke("overlay:set", cfg),
    screens: () => ipcRenderer.invoke("overlay:screens"),
    overlayCanEdit: () => ipcRenderer.invoke("overlay:canEdit"),
    overlayEdit: (on) => ipcRenderer.invoke("overlay:edit", on),
    onOverlayMoved: (fn) => ipcRenderer.on("overlay:moved", (_e, place) => fn(place)),
    onOverlayEdit: (fn) => ipcRenderer.on("overlay:edit", (_e, on) => fn(on)),
  },
});
