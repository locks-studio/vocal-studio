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
    onState: (fn) => ipcRenderer.on("voice:state", (_e, s) => fn(s)),
  },
  music: {
    source: (src) => ipcRenderer.invoke("music:source", src),
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
  spotify: {
    get: () => ipcRenderer.invoke("spotify:get"),
    save: (clientId) => ipcRenderer.invoke("spotify:save", clientId),
    login: () => ipcRenderer.invoke("spotify:login"),
    logout: () => ipcRenderer.invoke("spotify:logout"),
  },
  win: {
    minimize: () => ipcRenderer.invoke("win:minimize"),
    maximize: () => ipcRenderer.invoke("win:maximize"),
    close: () => ipcRenderer.invoke("win:close"),
    pin: (on) => ipcRenderer.invoke("win:pin", on),
    fullscreen: () => ipcRenderer.invoke("win:fullscreen"),
  },
});
