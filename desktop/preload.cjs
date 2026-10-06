const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('concord', {
  bootstrap: () => ipcRenderer.invoke('concord:bootstrap'),
  session: () => ipcRenderer.invoke('concord:session'),
  tunnel: () => ipcRenderer.invoke('concord:tunnel'),
  closeTunnel: () => ipcRenderer.invoke('concord:close-tunnel'),
  renewInvite: () => ipcRenderer.invoke('concord:invite'),
  copyInvite: () => ipcRenderer.invoke('concord:copy-invite'),
  sources: () => ipcRenderer.invoke('concord:sources'),
  selectSource: id => ipcRenderer.invoke('concord:select-source', id)
});
