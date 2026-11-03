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
  onProgress: (fn) => ipcRenderer.on("app:progress", (_e, p) => fn(p)),
  win: {
    minimize: () => ipcRenderer.invoke("win:minimize"),
    maximize: () => ipcRenderer.invoke("win:maximize"),
    close: () => ipcRenderer.invoke("win:close"),
  },
});
