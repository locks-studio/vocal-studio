// Aperçu : la vraie page de Hush, avec un faux Discord dont le vocal vient de la timeline de Hush Studio.
const { contextBridge, ipcRenderer } = require("electron");
const { makeStudio, prepareSettings } = require("./fake-studio");

prepareSettings();
const { api, emit } = makeStudio(ipcRenderer);
ipcRenderer.on("scene:state", (_e, s) => emit(s));
contextBridge.exposeInMainWorld("studio", api);
