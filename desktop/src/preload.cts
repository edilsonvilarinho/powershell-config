import { contextBridge, ipcRenderer } from 'electron';
import type { ApplyRequest, DesktopApi, ImportRequest, UserState } from './shared/settings.js';

const channels = {
  bootstrap: 'powershell-config:bootstrap',
  previewTheme: 'powershell-config:preview-theme',
  importTheme: 'powershell-config:import-theme',
  saveUserState: 'powershell-config:save-user-state',
  exportConfiguration: 'powershell-config:export-configuration',
  inspectConfigurationImport: 'powershell-config:inspect-configuration-import',
  applyConfigurationImport: 'powershell-config:apply-configuration-import',
  cancelConfigurationImport: 'powershell-config:cancel-configuration-import',
  validateCustomizations: 'powershell-config:validate-customizations',
  applySettings: 'powershell-config:apply-settings',
  restoreDefaults: 'powershell-config:restore-defaults',
  restoreLatestBackup: 'powershell-config:restore-latest-backup',
  openTerminal: 'powershell-config:open-terminal',
  openLogs: 'powershell-config:open-logs',
  quit: 'powershell-config:quit',
  notifyUnsavedCustomizations: 'powershell-config:notify-unsaved-customizations',
} as const;

const api: DesktopApi = {
  getBootstrap: () => ipcRenderer.invoke(channels.bootstrap),
  previewTheme: (themeId) => ipcRenderer.invoke(channels.previewTheme, themeId),
  importTheme: () => ipcRenderer.invoke(channels.importTheme),
  saveUserState: (userState: UserState, expectedRevision: string) => ipcRenderer.invoke(channels.saveUserState, userState, expectedRevision),
  exportConfiguration: () => ipcRenderer.invoke(channels.exportConfiguration),
  inspectConfigurationImport: () => ipcRenderer.invoke(channels.inspectConfigurationImport),
  applyConfigurationImport: (request: ImportRequest) => ipcRenderer.invoke(channels.applyConfigurationImport, request),
  cancelConfigurationImport: (token: string) => ipcRenderer.invoke(channels.cancelConfigurationImport, token),
  validateCustomizations: (items) => ipcRenderer.invoke(channels.validateCustomizations, items),
  applySettings: (request: ApplyRequest) => ipcRenderer.invoke(channels.applySettings, request),
  restoreDefaults: (expectedRevision) => ipcRenderer.invoke(channels.restoreDefaults, expectedRevision),
  restoreLatestBackup: (expectedRevision) => ipcRenderer.invoke(channels.restoreLatestBackup, expectedRevision),
  openTerminal: () => ipcRenderer.invoke(channels.openTerminal),
  openLogs: () => ipcRenderer.invoke(channels.openLogs),
  quit: () => ipcRenderer.send(channels.quit),
  notifyUnsavedCustomizations: (hasPending: boolean) => ipcRenderer.send(channels.notifyUnsavedCustomizations, hasPending),
};

contextBridge.exposeInMainWorld('powershellConfig', api);
