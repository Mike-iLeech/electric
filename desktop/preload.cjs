"use strict";
const { contextBridge, ipcRenderer } = require("electron");
function request(action, key, value) {
  const result = ipcRenderer.sendSync("electric:storage", { action, key, value });
  if (!result?.ok) throw new Error(result?.error || "Хранилище недоступно");
  return result.value;
}
contextBridge.exposeInMainWorld("electricDesktop", {
  info: request("info"),
  storage: {
    getItem: key => request("get", key),
    setItem: (key, value) => request("set", key, value),
  },
  openExport: token => ipcRenderer.invoke("electric:open-export", token),
  onExportCompleted: callback => {const listener=(_event,value)=>callback(value);ipcRenderer.on("electric:export-completed",listener);return ()=>ipcRenderer.removeListener("electric:export-completed",listener);},
  openDataFolder: () => ipcRenderer.invoke("electric:open-data"),
  openSettings: () => ipcRenderer.invoke("electric:open-settings"),
  getSettings: () => ipcRenderer.invoke("electric:get-settings"),
  setPreferences: changes => ipcRenderer.invoke("electric:set-preferences", changes),
  checkUpdates: () => ipcRenderer.invoke("electric:check-updates"),
  downloadUpdate: () => ipcRenderer.invoke("electric:download-update"),
  installUpdate: () => ipcRenderer.invoke("electric:install-update"),
  onSettingsChanged: callback => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("electric:settings-changed", listener);
    return () => ipcRenderer.removeListener("electric:settings-changed", listener);
  },
  onLanguageChanged: callback => {
    const listener = (_event, language) => callback(language);
    ipcRenderer.on("electric:language", listener);
    return () => ipcRenderer.removeListener("electric:language", listener);
  },
});
