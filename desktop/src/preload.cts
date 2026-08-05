import { contextBridge, ipcRenderer } from 'electron';
import type { ApplyRequest, DesktopApi } from './shared/settings.js';

const channels = {
  bootstrap: 'powershell-config:bootstrap',
  previewTheme: 'powershell-config:preview-theme',
  importTheme: 'powershell-config:import-theme',
  validateCustomizations: 'powershell-config:validate-customizations',
  applySettings: 'powershell-config:apply-settings',
  restoreDefaults: 'powershell-config:restore-defaults',
  restoreLatestBackup: 'powershell-config:restore-latest-backup',
  openTerminal: 'powershell-config:open-terminal',
  openLogs: 'powershell-config:open-logs',
  quit: 'powershell-config:quit',
} as const;

const api: DesktopApi = {
  getBootstrap: () => ipcRenderer.invoke(channels.bootstrap),
  previewTheme: (themeId) => ipcRenderer.invoke(channels.previewTheme, themeId),
  importTheme: () => ipcRenderer.invoke(channels.importTheme),
  validateCustomizations: (items) => ipcRenderer.invoke(channels.validateCustomizations, items),
  applySettings: (request: ApplyRequest) => ipcRenderer.invoke(channels.applySettings, request),
  restoreDefaults: (expectedRevision) => ipcRenderer.invoke(channels.restoreDefaults, expectedRevision),
  restoreLatestBackup: (expectedRevision) => ipcRenderer.invoke(channels.restoreLatestBackup, expectedRevision),
  openTerminal: () => ipcRenderer.invoke(channels.openTerminal),
  openLogs: () => ipcRenderer.invoke(channels.openLogs),
  quit: () => ipcRenderer.send(channels.quit),
};

contextBridge.exposeInMainWorld('powershellConfig', api);
