import { app, BrowserWindow, Tray } from 'electron';
import fs from 'node:fs';
import { createAppPaths } from './services/paths.js';
import { ApplicationService } from './services/applicationService.js';
import { setLaunchAtStartup } from './services/startupService.js';
import { registerIpcHandlers } from './ipc.js';
import { createMainWindow } from './window.js';
import { createTray } from './tray.js';
import { confirmQuitWithUnsavedChanges, getHasUnsavedCustomizations } from './unsavedChangesTracker.js';

type LaunchCommand = 'show' | 'shutdown' | 'enable-startup' | 'disable-startup' | 'sync-startup';

function parseCommand(args: string[]): LaunchCommand {
  if (args.includes('--shutdown')) return 'shutdown';
  if (args.includes('--set-startup=enabled')) return 'enable-startup';
  if (args.includes('--set-startup=disabled')) return 'disable-startup';
  if (args.includes('--sync-startup')) return 'sync-startup';
  return 'show';
}

const command = parseCommand(process.argv);
const gotLock = app.requestSingleInstanceLock({ command });
let quitting = command === 'shutdown';
let quitConfirmationInFlight = false;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

if (!gotLock) {
  app.quit();
} else {
  app.setAppUserModelId('com.edilsonvilarinho.powershellconfig');
  app.on('second-instance', (_event, _argv, _cwd, data) => {
    const nextCommand = (data as { command?: LaunchCommand }).command ?? 'show';
    if (nextCommand === 'shutdown') {
      quitting = true;
      app.quit();
      return;
    }
    if (nextCommand === 'enable-startup' || nextCommand === 'disable-startup') {
      setLaunchAtStartup(nextCommand === 'enable-startup');
      return;
    }
    if (nextCommand === 'sync-startup') {
      new ApplicationService(createAppPaths()).syncStartupPreference();
      return;
    }
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    if (command === 'shutdown') {
      app.quit();
      return;
    }
    if (command === 'enable-startup' || command === 'disable-startup') {
      setLaunchAtStartup(command === 'enable-startup');
      app.quit();
      return;
    }

    const service = new ApplicationService(createAppPaths());
    service.syncStartupPreference();
    registerIpcHandlers(service);
    mainWindow = createMainWindow();
    if (command === 'sync-startup') {
      service.syncStartupPreference();
      app.quit();
      return;
    }
    tray = createTray(mainWindow, service);
    const smokeResultPath = process.env.POWERSHELL_CONFIG_SMOKE_RESULT;
    if (smokeResultPath) {
      mainWindow.webContents.once('did-finish-load', async () => {
        try {
          const result = await mainWindow?.webContents.executeJavaScript(`new Promise((resolve) => {
            const deadline = Date.now() + 8000;
            const check = () => {
              const apiReady = typeof window.powershellConfig === 'object';
              const overviewReady = document.body.innerText.includes('Seu PowerShell, sob controle.');
              if ((apiReady && overviewReady) || Date.now() >= deadline) resolve({ apiReady, overviewReady, title: document.title });
              else setTimeout(check, 100);
            };
            check();
          })`);
          fs.writeFileSync(smokeResultPath, JSON.stringify(result), 'utf8');
        } finally {
          quitting = true;
          app.quit();
        }
      });
    }
    mainWindow.on('close', (event) => {
      if (!quitting) {
        event.preventDefault();
        mainWindow?.hide();
      }
    });
    mainWindow.once('ready-to-show', () => {
      if (!process.argv.includes('--hidden')) mainWindow?.show();
    });
  }).catch((error) => {
    console.error(error);
    app.exit(1);
  });

  app.on('before-quit', (event) => {
    if (quitting || quitConfirmationInFlight || !getHasUnsavedCustomizations()) {
      quitting = true;
      tray?.destroy();
      tray = null;
      return;
    }
    event.preventDefault();
    quitConfirmationInFlight = true;
    void confirmQuitWithUnsavedChanges(mainWindow).then((confirmed) => {
      quitConfirmationInFlight = false;
      if (confirmed) {
        quitting = true;
        app.quit();
      }
    });
  });

  app.on('window-all-closed', () => {
    // O aplicativo permanece ativo na bandeja no Windows.
  });
}
