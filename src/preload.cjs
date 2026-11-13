const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mossDesktop', {
  openLayout: () => ipcRenderer.invoke('layout:open'),
  saveLayout: text => ipcRenderer.invoke('layout:save', text),
  savePrompt: text => ipcRenderer.invoke('prompt:save', text),
  copyPrompt: text => ipcRenderer.invoke('prompt:copy', text),
});
