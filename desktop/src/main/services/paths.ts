import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export interface AppPaths {
  installRoot: string;
  configDirectory: string;
  settingsPath: string;
  activeThemePath: string;
  importedThemesDirectory: string;
  previewCacheDirectory: string;
  backupDirectory: string;
  statePath: string;
  logPath: string;
  terminalSettingsPath: string;
  profilePath: string;
  managedProfilePath: string;
  builtinThemePath: string;
}

function resolveInstallRoot(): string {
  if (process.env.POWERSHELL_CONFIG_ROOT) {
    return path.resolve(process.env.POWERSHELL_CONFIG_ROOT);
  }
  if (app.isPackaged) {
    return path.resolve(path.dirname(process.execPath), '..');
  }
  return path.join(app.getPath('userData'), 'development');
}

function resolveTerminalSettingsPath(): string {
  const localAppData = process.env.LOCALAPPDATA ?? app.getPath('appData');
  const packaged = path.join(localAppData, 'Packages', 'Microsoft.WindowsTerminal_8wekyb3d8bbwe', 'LocalState', 'settings.json');
  const unpackaged = path.join(localAppData, 'Microsoft', 'Windows Terminal', 'settings.json');
  if (process.env.POWERSHELL_CONFIG_TERMINAL_SETTINGS) {
    return path.resolve(process.env.POWERSHELL_CONFIG_TERMINAL_SETTINGS);
  }
  if (fs.existsSync(packaged)) return packaged;
  if (fs.existsSync(unpackaged)) return unpackaged;
  return packaged;
}

export function createAppPaths(): AppPaths {
  const installRoot = resolveInstallRoot();
  const configDirectory = path.join(installRoot, 'config');
  const terminalSettingsPath = resolveTerminalSettingsPath();
  const documents = app.getPath('documents');
  const statePath = path.join(installRoot, 'state', 'install-state.json');
  let profilePath = path.join(documents, 'PowerShell', 'Microsoft.PowerShell_profile.ps1');
  if (fs.existsSync(statePath)) {
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as { Profile?: { Path?: unknown } };
      if (typeof state.Profile?.Path === 'string' && path.isAbsolute(state.Profile.Path)) profilePath = state.Profile.Path;
    } catch {
      // O diagnóstico de integridade reportará o estado inválido; nenhum caminho não validado é usado.
    }
  }
  const devBuiltinTheme = path.resolve(app.getAppPath(), '..', 'powershell', 'takuya.omp.json');
  const devManagedProfile = path.resolve(app.getAppPath(), '..', 'powershell', 'user_profile.ps1');
  const installedBuiltinTheme = path.join(installRoot, 'takuya.omp.json');

  return {
    installRoot,
    configDirectory,
    settingsPath: path.join(configDirectory, 'settings.json'),
    activeThemePath: path.join(configDirectory, 'themes', 'active.omp.json'),
    importedThemesDirectory: path.join(configDirectory, 'themes', 'imported'),
    previewCacheDirectory: path.join(configDirectory, 'cache', 'previews'),
    backupDirectory: path.join(installRoot, 'backups', 'desktop'),
    statePath,
    logPath: path.join(installRoot, 'PowerShellConfig-desktop.log'),
    terminalSettingsPath,
    profilePath,
    managedProfilePath: app.isPackaged ? path.join(installRoot, 'profile.ps1') : devManagedProfile,
    builtinThemePath: app.isPackaged ? installedBuiltinTheme : devBuiltinTheme,
  };
}
