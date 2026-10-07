const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('concord', {
  bootstrap: () => ipcRenderer.invoke('concord:bootstrap'),
  session: () => ipcRenderer.invoke('concord:session'),
  tunnel: () => ipcRenderer.invoke('concord:tunnel'),
  closeTunnel: () => ipcRenderer.invoke('concord:close-tunnel'),
  renewInvite: () => ipcRenderer.invoke('concord:invite'),
  copyInvite: () => ipcRenderer.invoke('concord:copy-invite'),
  startAppAudio: id => ipcRenderer.invoke('concord:start-app-audio', id),
  stopAppAudio: () => ipcRenderer.invoke('concord:stop-app-audio'),
  onAppAudio: callback => {
    const listener = (event, bytes) => callback(bytes);
    ipcRenderer.on('concord:app-audio-data', listener);
    return () => ipcRenderer.removeListener('concord:app-audio-data', listener);
  },
  onAppAudioError: callback => {
    const listener = (event, message) => callback(message);
    ipcRenderer.on('concord:app-audio-error', listener);
    return () => ipcRenderer.removeListener('concord:app-audio-error', listener);
  },
  sources: () => ipcRenderer.invoke('concord:sources'),
  selectSource: id => ipcRenderer.invoke('concord:select-source', id)
});
