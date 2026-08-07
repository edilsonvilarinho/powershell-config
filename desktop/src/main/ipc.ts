import { app, ipcMain } from 'electron';
import { ipcChannels } from '../shared/ipc.js';
import type { ApplyRequest, ImportRequest, UserState } from '../shared/settings.js';
import { ApplicationService } from './services/applicationService.js';
import { setHasUnsavedCustomizations } from './unsavedChangesTracker.js';

export function registerIpcHandlers(service: ApplicationService): void {
  ipcMain.handle(ipcChannels.bootstrap, () => service.bootstrap());
  ipcMain.handle(ipcChannels.previewTheme, (_event, themeId: unknown) => {
    if (typeof themeId !== 'string' || themeId.length > 128) throw new Error('Identificador de tema inválido.');
    return service.themeService.preview(themeId);
  });
  ipcMain.handle(ipcChannels.importTheme, () => service.themeService.importWithDialog());
  ipcMain.handle(ipcChannels.saveUserState, (_event, userState: UserState, expectedRevision: unknown) => {
    if (typeof expectedRevision !== 'string') throw new Error('Revisão inválida.');
    return service.saveUserState(userState, expectedRevision);
  });
  ipcMain.handle(ipcChannels.exportConfiguration, () => service.exportConfiguration());
  ipcMain.handle(ipcChannels.inspectConfigurationImport, () => service.inspectConfigurationImport());
  ipcMain.handle(ipcChannels.applyConfigurationImport, (_event, request: ImportRequest) => service.applyConfigurationImport(request));
  ipcMain.handle(ipcChannels.cancelConfigurationImport, (_event, token: unknown) => {
    if (typeof token !== 'string' || token.length > 128) throw new Error('Token de importação inválido.');
    service.cancelConfigurationImport(token);
  });
  ipcMain.handle(ipcChannels.validateCustomizations, (_event, items: unknown) => {
    if (!Array.isArray(items) || items.length > 200) throw new Error('Lista de customizações inválida.');
    const valid = items.every((item) => {
      if (!item || typeof item !== 'object') return false;
      const record = item as Record<string, unknown>;
      return typeof record.id === 'string'
        && record.id.length <= 64
        && (record.kind === 'function' || record.kind === 'command')
        && (record.name === undefined || (typeof record.name === 'string' && record.name.length <= 128))
        && typeof record.code === 'string'
        && record.code.length <= 32_768;
    });
    if (!valid) throw new Error('Dados de customização inválidos.');
    return service.validateCustomizations(items);
  });
  ipcMain.handle(ipcChannels.applySettings, (_event, request: ApplyRequest) => service.apply(request));
  ipcMain.handle(ipcChannels.restoreDefaults, (_event, revision: unknown) => {
    if (typeof revision !== 'string') throw new Error('Revisão inválida.');
    return service.restoreDefaults(revision);
  });
  ipcMain.handle(ipcChannels.restoreLatestBackup, (_event, revision: unknown) => {
    if (typeof revision !== 'string') throw new Error('Revisão inválida.');
    return service.restoreLatestBackup(revision);
  });
  ipcMain.handle(ipcChannels.selectBackgroundImage, () => service.terminalService.selectBackgroundImageWithDialog());
  ipcMain.handle(ipcChannels.selectProfileIcon, () => service.terminalService.selectProfileIconWithDialog());
  ipcMain.handle(ipcChannels.openTerminal, () => service.openTerminal());
  ipcMain.handle(ipcChannels.openLogs, () => service.openLogs());
  ipcMain.on(ipcChannels.quit, () => app.quit());
  ipcMain.on(ipcChannels.notifyUnsavedCustomizations, (_event, hasPending: unknown) => {
    setHasUnsavedCustomizations(Boolean(hasPending));
  });
}
