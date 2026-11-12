const { contextBridge, ipcRenderer } = require("electron");

// Sans flou du système (Linux), la page met un fond rose plein
addEventListener("DOMContentLoaded", () => document.body.classList.add("os-" + process.platform));

contextBridge.exposeInMainWorld("launcher", {
  catalog: () => ipcRenderer.invoke("catalog:get"),
  install: (id) => ipcRenderer.invoke("app:install", { id }),
  cancel: (id) => ipcRenderer.invoke("app:cancel", id),
  launch: (id) => ipcRenderer.invoke("app:launch", id),
  uninstall: (id) => ipcRenderer.invoke("app:uninstall", id),
  folder: (id) => ipcRenderer.invoke("app:folder", id),
  usage: (app) => ipcRenderer.invoke("app:usage", { usageDir: app.usageDir }),
  openUrl: (url) => ipcRenderer.invoke("open:url", url),
  // Mise à jour du launcher lui-même
  selfUpdate: {
    state: () => ipcRenderer.invoke("launcher:update"),
    apply: () => ipcRenderer.invoke("launcher:apply"),
    on: (fn) => ipcRenderer.on("launcher:update", (_e, s) => fn(s)),
  },
  onProgress: (fn) => ipcRenderer.on("app:progress", (_e, p) => fn(p)),
  desk: {
    wallpaper: () => ipcRenderer.invoke("desk:wallpaper"),
    bounds: () => ipcRenderer.invoke("win:bounds"),
    onBounds: (fn) => ipcRenderer.on("win:bounds", (_e, b) => fn(b)),
    onFocus: (fn) => ipcRenderer.on("win:focus", (_e, on) => fn(on)),
  },
  invite: () => ipcRenderer.invoke("open:invite"),
  privacy: () => ipcRenderer.invoke("open:privacy"),
  reload: () => ipcRenderer.invoke("win:reload"),
  test: {
    join: (code) => ipcRenderer.invoke("test:join", code),
    leave: () => ipcRenderer.invoke("test:leave"),
  },
  account: {
    get: () => ipcRenderer.invoke("account:get"),
    login: () => ipcRenderer.invoke("account:login"),
    cancel: () => ipcRenderer.invoke("account:cancel"),
    logout: () => ipcRenderer.invoke("account:logout"),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (patch) => ipcRenderer.invoke("settings:set", patch),
  },
  win: {
    minimize: () => ipcRenderer.invoke("win:minimize"),
    maximize: () => ipcRenderer.invoke("win:maximize"),
    close: () => ipcRenderer.invoke("win:close"),
  },
});
