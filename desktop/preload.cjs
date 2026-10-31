const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('concord', {
  bootstrap: () => ipcRenderer.invoke('concord:bootstrap'),
  savePreferences: value => ipcRenderer.invoke('concord:preferences', value),
  invitesReady: () => ipcRenderer.invoke('concord:invites-ready'),
  onInvite: callback => {
    const listener = (event, value) => callback(value);
    ipcRenderer.on('concord:open-invite', listener);
    return () => ipcRenderer.removeListener('concord:open-invite', listener);
  },
  updateState: () => ipcRenderer.invoke('concord:update-state'),
  updatesReady: () => ipcRenderer.invoke('concord:update-ready'),
  checkUpdates: () => ipcRenderer.invoke('concord:check-updates'),
  installUpdate: () => ipcRenderer.invoke('concord:install-update'),
  onUpdate: callback => {
    const listener = (event, state) => callback(state);
    ipcRenderer.on('concord:update-state', listener);
    return () => ipcRenderer.removeListener('concord:update-state', listener);
  },
  setName: name => ipcRenderer.invoke('concord:set-name', name),
  choosePhoto: () => ipcRenderer.invoke('concord:choose-photo'),
  removePhoto: () => ipcRenderer.invoke('concord:remove-photo'),
  chooseBanner: () => ipcRenderer.invoke('concord:choose-banner'),
  removeBanner: () => ipcRenderer.invoke('concord:remove-banner'),
  linkDiscord: () => ipcRenderer.invoke('concord:discord-link'),
  refreshDiscord: () => ipcRenderer.invoke('concord:discord-refresh'),
  unlinkDiscord: () => ipcRenderer.invoke('concord:discord-unlink'),
  cancelDiscord: () => ipcRenderer.invoke('concord:discord-cancel'),
  discordFriends: () => ipcRenderer.invoke('concord:discord-friends'),
  discordFriendPhoto: id => ipcRenderer.invoke('concord:discord-friend-photo', id),
  sendDiscordInvite: (id, value) => ipcRenderer.invoke('concord:discord-send-invite', id, value),
  session: () => ipcRenderer.invoke('concord:session'),
  tunnel: () => ipcRenderer.invoke('concord:tunnel'),
  closeTunnel: () => ipcRenderer.invoke('concord:close-tunnel'),
  renewInvite: () => ipcRenderer.invoke('concord:invite'),
  copyInvite: value => ipcRenderer.invoke('concord:copy-invite', value),
  copyLink: value => ipcRenderer.invoke('concord:copy-link', value),
  clipboardInvite: () => ipcRenderer.invoke('concord:clipboard-invite'),
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
  allowCamera: () => ipcRenderer.invoke('concord:allow-camera'),
  sources: () => ipcRenderer.invoke('concord:sources'),
  selectSource: id => ipcRenderer.invoke('concord:select-source', id)
});
