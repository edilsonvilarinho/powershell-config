import fs from 'node:fs';
import path from 'node:path';
import type { Diagnostics } from '../../shared/settings.js';
import type { AppPaths } from './paths.js';
import { SettingsService } from './settingsService.js';
import { execFileSafe, resolveWindowsExecutable } from './processService.js';

async function versionOf(executable: string, args: string[]): Promise<string | null> {
  try {
    return (await execFileSafe(executable, args, 5_000)).stdout.split(/\r?\n/)[0] || null;
  } catch {
    return null;
  }
}

async function installedModules(executable: string): Promise<Set<string>> {
  try {
    const result = await execFileSafe(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      "$names = @('posh-git','Terminal-Icons'); $names | ForEach-Object { if (Get-Module -ListAvailable -Name $_) { $_ } }",
    ], 5_000);
    return new Set(result.stdout.split(/\r?\n/).filter(Boolean));
  } catch {
    return new Set();
  }
}

async function executableAvailable(executable: string): Promise<boolean> {
  if (path.isAbsolute(executable)) return fs.existsSync(executable);
  const whereExecutable = path.join(process.env.WINDIR ?? 'C:\\Windows', 'System32', 'where.exe');
  try {
    await execFileSafe(whereExecutable, [executable], 3_000);
    return true;
  } catch {
    return false;
  }
}

export class DiagnosticsService {
  constructor(
    private readonly paths: AppPaths,
    private readonly settingsService: SettingsService,
  ) {}

  async collect(): Promise<Diagnostics> {
    let settingsValid = true;
    try {
      this.settingsService.read();
    } catch {
      settingsValid = false;
    }
    const profile = fs.existsSync(this.paths.profilePath) ? fs.readFileSync(this.paths.profilePath, 'utf8') : '';
    const windowsTerminalExecutable = resolveWindowsExecutable('wt.exe', [
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'wt.exe') : null,
    ]);
    const powershellExecutable = resolveWindowsExecutable('pwsh.exe', [
      process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'PowerShell', '7', 'pwsh.exe') : null,
    ]);
    const ohMyPoshExecutable = resolveWindowsExecutable('oh-my-posh.exe', [
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'oh-my-posh', 'bin', 'oh-my-posh.exe') : null,
    ]);
    const modules = await installedModules(powershellExecutable);
    const configuredFont = this.settingsService.read().terminal.fontFace;
    const fontRegistryPaths = [
      path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'Windows', 'Fonts'),
      path.join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts'),
    ];
    const normalizedFont = configuredFont.replace(/\s+(NF|Nerd Font).*$/i, '').replace(/\s+/g, '').toLowerCase();
    const configuredFontInstalled = fontRegistryPaths.some((directory) => fs.existsSync(directory) &&
      fs.readdirSync(directory).some((file) => file.replace(/\s+/g, '').toLowerCase().includes(normalizedFont)));
    return {
      powershellVersion: await versionOf(powershellExecutable, ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()']),
      ohMyPoshVersion: await versionOf(ohMyPoshExecutable, ['version']),
      terminalSettingsPath: fs.existsSync(this.paths.terminalSettingsPath) ? this.paths.terminalSettingsPath : null,
      terminalAvailable: await executableAvailable(windowsTerminalExecutable),
      profileLoaderInstalled: profile.includes('# >>> powershell-config >>>') && profile.includes('# <<< powershell-config <<<'),
      settingsValid,
      activeThemeExists: fs.existsSync(this.paths.activeThemePath),
      poshGitInstalled: modules.has('posh-git'),
      terminalIconsInstalled: modules.has('Terminal-Icons'),
      configuredFontInstalled,
    };
  }
}
