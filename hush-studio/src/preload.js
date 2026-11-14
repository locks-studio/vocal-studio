const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("hs", {
  sceneInfo: () => ipcRenderer.invoke("scene:info"),
  pickAudio: () => ipcRenderer.invoke("files:pickAudio"),
  importFiles: (paths) => ipcRenderer.invoke("files:import", paths),
  analyze: (file) => ipcRenderer.invoke("audio:analyze", file),
  onProgress: (fn) => ipcRenderer.on("audio:progress", (_e, p) => fn(p)),
  exists: (list) => ipcRenderer.invoke("files:exists", list),
  pickImage: () => ipcRenderer.invoke("files:pickImage"),
  pickPreset: () => ipcRenderer.invoke("files:pickPreset"),
  openProject: (file) => ipcRenderer.invoke("project:open", file),
  saveProject: (data, file, saveAs) => ipcRenderer.invoke("project:save", data, file, saveAs),
  autosave: (data) => ipcRenderer.invoke("project:autosave", data),
  recover: () => ipcRenderer.invoke("project:recover"),
  locate: (name) => ipcRenderer.invoke("project:locate", name),
  version: () => ipcRenderer.invoke("app:version"),
  onClosing: (fn) => ipcRenderer.on("app:closing", () => fn()),
  confirmClose: () => ipcRenderer.invoke("app:confirmClose"),
  // Glisser-déposer : le chemin du fichier lâché sur la fenêtre
  exp: {
    pick: (name) => ipcRenderer.invoke("export:pick", name),
    begin: (o) => ipcRenderer.invoke("export:begin", o),
    frame: (state, look, dt, warmup) => ipcRenderer.invoke("export:frame", state, look, dt, warmup),
    end: () => ipcRenderer.invoke("export:end"),
    cancel: () => ipcRenderer.invoke("export:cancel"),
    show: (f) => ipcRenderer.invoke("export:show", f),
  },
  pathOf: (file) => webUtils.getPathForFile(file),
  test: { info: () => ipcRenderer.invoke("test:info"), shot: (n) => ipcRenderer.invoke("test:shot", n), quit: () => ipcRenderer.invoke("test:quit"), log: (m) => ipcRenderer.invoke("test:log", m) },
});
