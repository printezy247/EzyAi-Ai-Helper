'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ezyai', {
  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    targets: () => ipcRenderer.invoke('skills:targets'),
    create: (name, content) => ipcRenderer.invoke('skills:create', name, content),
    delete: (name) => ipcRenderer.invoke('skills:delete', name),
    sync: (name, targetId) => ipcRenderer.invoke('skills:sync', name, targetId),
    unsync: (name, targetId) => ipcRenderer.invoke('skills:unsync', name, targetId),
  },
  ssh: {
    run: (host, command, opts) => ipcRenderer.invoke('ssh:run', host, command, opts),
    transfer: (host, localPath, remotePath, direction, opts) =>
      ipcRenderer.invoke('ssh:transfer', host, localPath, remotePath, direction, opts),
  },
});
