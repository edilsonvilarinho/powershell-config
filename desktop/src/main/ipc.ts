import { app, ipcMain } from 'electron';
import { ipcChannels } from '../shared/ipc.js';
import type { ApplyRequest } from '../shared/settings.js';
import { ApplicationService } from './services/applicationService.js';

export function registerIpcHandlers(service: ApplicationService): void {
  ipcMain.handle(ipcChannels.bootstrap, () => service.bootstrap());
  ipcMain.handle(ipcChannels.previewTheme, (_event, themeId: unknown) => {
    if (typeof themeId !== 'string' || themeId.length > 128) throw new Error('Identificador de tema inválido.');
    return service.themeService.preview(themeId);
  });
  ipcMain.handle(ipcChannels.importTheme, () => service.themeService.importWithDialog());
  ipcMain.handle(ipcChannels.applySettings, (_event, request: ApplyRequest) => service.apply(request));
  ipcMain.handle(ipcChannels.restoreDefaults, (_event, revision: unknown) => {
    if (typeof revision !== 'string') throw new Error('Revisão inválida.');
    return service.restoreDefaults(revision);
  });
  ipcMain.handle(ipcChannels.restoreLatestBackup, (_event, revision: unknown) => {
    if (typeof revision !== 'string') throw new Error('Revisão inválida.');
    return service.restoreLatestBackup(revision);
  });
  ipcMain.handle(ipcChannels.openTerminal, () => service.openTerminal());
  ipcMain.handle(ipcChannels.openLogs, () => service.openLogs());
  ipcMain.on(ipcChannels.quit, () => app.quit());
}
