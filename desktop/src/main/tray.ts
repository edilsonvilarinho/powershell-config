import { app, BrowserWindow, dialog, Menu, nativeImage, Tray } from 'electron';
import path from 'node:path';
import { ApplicationService } from './services/applicationService.js';

export function createTray(window: BrowserWindow, service: ApplicationService): Tray {
  const iconPath = path.join(app.getAppPath(), 'assets', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 });
  const tray = new Tray(icon);
  tray.setToolTip('PowerShell Config');

  const toggleWindow = (): void => {
    if (window.isVisible()) {
      window.hide();
    } else {
      window.show();
      window.focus();
    }
  };

  const rebuildMenu = (): void => {
    const settings = service.settingsService.read();
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Abrir PowerShell Config', click: () => { window.show(); window.focus(); } },
      { label: 'Abrir Windows Terminal', click: () => { void service.openTerminal().catch((error) => dialog.showErrorBox('PowerShell Config', error instanceof Error ? error.message : String(error))); } },
      { type: 'separator' },
      {
        label: 'Iniciar com Windows',
        type: 'checkbox',
        checked: settings.startup.enabled,
        click: async (item) => {
          try {
            const current = service.settingsService.read();
            await service.apply({
              settings: { ...current, startup: { enabled: item.checked } },
              expectedRevision: service.revision(),
            });
            rebuildMenu();
          } catch (error) {
            dialog.showErrorBox('PowerShell Config', error instanceof Error ? error.message : String(error));
            rebuildMenu();
          }
        },
      },
      { type: 'separator' },
      { label: 'Sair', click: () => app.quit() },
    ]));
  };

  rebuildMenu();
  tray.on('click', toggleWindow);
  tray.on('right-click', rebuildMenu);
  return tray;
}
