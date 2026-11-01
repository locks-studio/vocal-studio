const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("studio", {
  config: {
    get: () => ipcRenderer.invoke("config:get"),
    save: (c) => ipcRenderer.invoke("config:save", c),
    logout: () => ipcRenderer.invoke("config:logout"),
  },
  bot: {
    login: () => ipcRenderer.invoke("bot:login"),
  },
  voice: {
    start: () => ipcRenderer.invoke("voice:start"),
    stop: () => ipcRenderer.invoke("voice:stop"),
    state: () => ipcRenderer.invoke("voice:state"),
    mute: (v) => ipcRenderer.invoke("voice:mute", v),
    deaf: (v) => ipcRenderer.invoke("voice:deaf", v),
    leave: () => ipcRenderer.invoke("voice:leave"),
    summon: () => ipcRenderer.invoke("voice:summon"),
    user: (a) => ipcRenderer.invoke("voice:user", a),
    openProfile: (id) => ipcRenderer.invoke("discord:user", id),
    copy: (text) => ipcRenderer.invoke("clip:write", text),
    onState: (fn) => ipcRenderer.on("voice:state", (_e, s) => fn(s)),
  },
  music: {
    source: (src) => ipcRenderer.invoke("music:source", src),
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
  win: {
    minimize: () => ipcRenderer.invoke("win:minimize"),
    maximize: () => ipcRenderer.invoke("win:maximize"),
    close: () => ipcRenderer.invoke("win:close"),
    pin: (on) => ipcRenderer.invoke("win:pin", on),
    fullscreen: () => ipcRenderer.invoke("win:fullscreen"),
    mini: () => ipcRenderer.invoke("win:mini"),
    focusMain: () => ipcRenderer.invoke("win:main"),
    onMini: (fn) => ipcRenderer.on("win:mini", (_e, open) => fn(open)),
  },
});
