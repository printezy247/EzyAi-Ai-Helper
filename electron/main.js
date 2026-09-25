'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const skills = require('../core/skills/skillsManager');
const ssh = require('../core/ssh/sshClient');

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    title: 'EzyAi Helper',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

// --- Skills Hub IPC -------------------------------------------------------
ipcMain.handle('skills:list', () => skills.listSkills());
ipcMain.handle('skills:targets', () => skills.knownTargets());
ipcMain.handle('skills:create', (_e, name, content) => skills.createSkill(name, content));
ipcMain.handle('skills:delete', (_e, name) => skills.deleteSkill(name));
ipcMain.handle('skills:sync', (_e, name, targetId) => skills.syncSkill(name, targetId));
ipcMain.handle('skills:unsync', (_e, name, targetId) => skills.unsyncSkill(name, targetId));

// --- SSH Ops IPC -----------------------------------------------------------
ipcMain.handle('ssh:run', (_e, host, command, opts) => ssh.runCommand(host, command, opts));
ipcMain.handle('ssh:transfer', (_e, host, localPath, remotePath, direction, opts) =>
  ssh.transferFile(host, localPath, remotePath, direction, opts)
);

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
