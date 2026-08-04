import { app } from 'electron';

export function setLaunchAtStartup(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
    args: ['--hidden'],
  });
}

export function isLaunchAtStartupEnabled(): boolean {
  return app.getLoginItemSettings({ path: process.execPath, args: ['--hidden'] }).openAtLogin;
}
