const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', Object.freeze({
  importChats: () => ipcRenderer.invoke('import-chat'),
  saveReport: (data) => ipcRenderer.invoke('save-report', data),
  whatsapp: Object.freeze({
    status: () => ipcRenderer.invoke('wa-status'),
    connect: () => ipcRenderer.invoke('wa-connect'),
    chats: () => ipcRenderer.invoke('wa-chats'),
    sync: (ids, options) => ipcRenderer.invoke('wa-sync', ids, options),
    cancelSync: () => ipcRenderer.invoke('wa-cancel-sync'),
    repair: () => ipcRenderer.invoke('wa-repair'),
    stop: (logout = false) => ipcRenderer.invoke('wa-stop', logout),
    on: (channel, callback) => {
      if (!['wa:state', 'wa:qr', 'wa:error', 'wa:batch', 'wa:progress', 'wa:message', 'wa:coverage'].includes(channel) || typeof callback !== 'function') throw new Error('Canal inválido');
      const listener = (_event, value) => callback(value);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    }
  })
}));