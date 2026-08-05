import { app, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ApplyRequest,
  ApplyResult,
  BackupInfo,
  BootstrapData,
  CustomizationCodeInput,
  CustomizationValidationResult,
} from '../../shared/settings.js';
import { defaultSettings, migrateSettings, settingsSchema } from '../../shared/settings.js';
import type { AppPaths } from './paths.js';
import { appendLog, copyIfExists, ensureDirectory, hashFile, readUtf8, sha256, writeAtomic } from './fileService.js';
import { SettingsService } from './settingsService.js';
import { TerminalService } from './terminalService.js';
import { ThemeService } from './themeService.js';
import { DiagnosticsService } from './diagnosticsService.js';
import { isLaunchAtStartupEnabled, setLaunchAtStartup } from './startupService.js';
import { execFileSafe, resolveWindowsExecutable } from './processService.js';
import { buildCustomProfile } from './customProfileService.js';
import {
  findNativeAliasCollisions,
  listNativeAliases,
  validateCustomizationCode,
} from './powershellCustomizationService.js';

interface SnapshotEntry {
  target: string;
  backup: string;
  existed: boolean;
}

export class ApplicationService {
  readonly settingsService: SettingsService;
  readonly terminalService: TerminalService;
  readonly themeService: ThemeService;
  readonly diagnosticsService: DiagnosticsService;

  constructor(private readonly paths: AppPaths) {
    this.settingsService = new SettingsService(paths);
    this.terminalService = new TerminalService(paths);
    this.themeService = new ThemeService(paths);
    this.diagnosticsService = new DiagnosticsService(paths, this.settingsService);
    this.settingsService.ensureInitialized();
    this.themeService.list();
    this.themeService.ensureActiveTheme();
  }

  revision(): string {
    const pieces = [
      readUtf8(this.paths.settingsPath) ?? 'missing',
      this.terminalService.readContent(),
      this.terminalService.fragmentHash(),
      hashFile(this.paths.activeThemePath),
      hashFile(this.paths.statePath),
      hashFile(this.paths.profilePath),
      hashFile(this.paths.managedProfilePath),
      hashFile(this.paths.customProfilePath),
    ];
    return sha256(pieces.join('\n---powershell-config---\n'));
  }

  async bootstrap(): Promise<BootstrapData> {
    const settings = this.settingsService.read();
    const [diagnostics, nativeAliases] = await Promise.all([
      this.diagnosticsService.collect(),
      listNativeAliases().catch(() => []),
    ]);
    return {
      settings,
      revision: this.revision(),
      themes: this.themeService.list(),
      colorSchemes: this.terminalService.listColorSchemes(),
      diagnostics,
      nativeAliases,
      appVersion: app.getVersion(),
      backups: this.listBackups(),
    };
  }

  async apply(request: ApplyRequest): Promise<ApplyResult> {
    if (!request || typeof request.expectedRevision !== 'string') throw new Error('Requisição de aplicação inválida.');
    const parsedRequest = settingsSchema.safeParse(request.settings);
    if (!parsedRequest.success) {
      throw new Error(parsedRequest.error.issues[0]?.message ?? 'As configurações informadas são inválidas.');
    }
    const requested = parsedRequest.data;
    const currentRevision = this.revision();
    if (request.expectedRevision !== currentRevision) {
      throw new Error('As configurações foram alteradas externamente. Recarregue antes de aplicar.');
    }

    const nativeAliases = await listNativeAliases();
    const collision = findNativeAliasCollisions(requested, nativeAliases)[0];
    if (collision) throw new Error(collision.message);
    const codeValidation = await this.validateCustomizations([
      ...requested.customizations.functions.map((entry) => ({
        id: entry.id,
        kind: 'function' as const,
        name: entry.name,
        code: entry.body,
      })),
      ...requested.customizations.commands.map((entry) => ({
        id: entry.id,
        kind: 'command' as const,
        code: entry.code,
      })),
    ]);
    const codeIssue = codeValidation.issues[0];
    if (codeIssue) {
      const functionEntry = requested.customizations.functions.find((item) => item.id === codeIssue.id);
      const commandEntry = requested.customizations.commands.find((item) => item.id === codeIssue.id);
      const position = codeIssue.line ? `, linha ${codeIssue.line}` : '';
      const label = functionEntry ? `Função "${functionEntry.name}"` : `Comando "${commandEntry?.label ?? codeIssue.id}"`;
      throw new Error(`${label}${position}: ${codeIssue.message}`);
    }

    const currentSettings = this.settingsService.read();
    const selectedTheme = this.themeService.resolve(requested.prompt.themeId);
    const nextSettings = settingsSchema.parse({
      ...requested,
      prompt: { ...requested.prompt, themeName: selectedTheme.name },
    });
    if (!this.terminalService.listColorSchemes().includes(nextSettings.terminal.colorScheme)) {
      throw new Error('O esquema de cores selecionado não existe no Windows Terminal.');
    }

    await this.themeService.preview(nextSettings.prompt.themeId);
    await this.validateManagedProfileSyntax();
    const nextCustomProfileContent = buildCustomProfile(nextSettings);
    await this.validateGeneratedProfileSyntax(nextCustomProfileContent);
    const nextSettingsContent = this.settingsService.serialize(nextSettings);
    const nextThemeContent = this.themeService.readTheme(nextSettings.prompt.themeId);
    const nextTerminalContent = this.terminalService.buildContent(nextSettings);
    const nextStateContent = this.terminalService.updateInstallerState(nextTerminalContent, nextSettings);
    const backupRoot = path.join(this.paths.backupDirectory, new Date().toISOString().replace(/[:.]/g, '-'));
    ensureDirectory(backupRoot);

    const entries = [
      this.snapshot(this.paths.settingsPath, path.join(backupRoot, 'settings.json')),
      this.snapshot(this.paths.activeThemePath, path.join(backupRoot, 'active.omp.json')),
      this.snapshot(this.paths.terminalSettingsPath, path.join(backupRoot, 'terminal-settings.json')),
      this.snapshot(this.paths.statePath, path.join(backupRoot, 'install-state.json')),
      this.snapshot(this.paths.customProfilePath, path.join(backupRoot, 'custom-profile.ps1')),
    ];
    const previousStartup = isLaunchAtStartupEnabled();

    try {
      writeAtomic(this.paths.settingsPath, nextSettingsContent);
      writeAtomic(this.paths.customProfilePath, nextCustomProfileContent);
      writeAtomic(this.paths.activeThemePath, nextThemeContent);
      writeAtomic(this.paths.terminalSettingsPath, nextTerminalContent);
      if (nextStateContent) writeAtomic(this.paths.statePath, nextStateContent);
      setLaunchAtStartup(nextSettings.startup.enabled);
      if (!currentSettings.help.showOnFirstRun && nextSettings.help.showOnFirstRun) {
        fs.rmSync(path.join(this.paths.installRoot, 'state', 'first-run-complete'), { force: true });
      }
      appendLog(this.paths.logPath, `Configurações aplicadas. revision=${this.revision()}`);
    } catch (error) {
      this.restore(entries);
      setLaunchAtStartup(previousStartup);
      appendLog(this.paths.logPath, `Falha ao aplicar; rollback executado. ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }

    return {
      settings: nextSettings,
      revision: this.revision(),
      appliedAt: new Date().toISOString(),
    };
  }

  validateCustomizations(items: CustomizationCodeInput[]): Promise<CustomizationValidationResult> {
    return validateCustomizationCode(items);
  }

  restoreDefaults(expectedRevision: string): Promise<ApplyResult> {
    return this.apply({ settings: defaultSettings, expectedRevision });
  }

  async restoreLatestBackup(expectedRevision: string): Promise<ApplyResult> {
    if (expectedRevision !== this.revision()) {
      throw new Error('As configurações foram alteradas externamente. Recarregue antes de restaurar.');
    }
    const latest = this.listBackups()[0];
    if (!latest) throw new Error('Nenhum backup do aplicativo está disponível.');
    const sourceRoot = path.join(this.paths.backupDirectory, latest.id);
    const settingsContent = readUtf8(path.join(sourceRoot, 'settings.json'));
    const themeContent = fs.existsSync(path.join(sourceRoot, 'active.omp.json')) ? fs.readFileSync(path.join(sourceRoot, 'active.omp.json')) : null;
    const terminalContent = readUtf8(path.join(sourceRoot, 'terminal-settings.json'));
    const stateContent = readUtf8(path.join(sourceRoot, 'install-state.json'));
    if (!settingsContent || !themeContent || !terminalContent) throw new Error('O backup mais recente está incompleto.');
    const restoredSettings = migrateSettings(JSON.parse(settingsContent));
    const restoreCollision = findNativeAliasCollisions(restoredSettings, await listNativeAliases())[0];
    if (restoreCollision) throw new Error(restoreCollision.message);
    const restoredSettingsContent = this.settingsService.serialize(restoredSettings);
    const restoredCustomProfileContent = buildCustomProfile(restoredSettings);
    JSON.parse(themeContent.toString('utf8'));
    this.terminalService.validateContent(terminalContent);
    await this.validateManagedProfileSyntax();
    await this.validateGeneratedProfileSyntax(restoredCustomProfileContent);

    const safetyRoot = path.join(this.paths.backupDirectory, `${new Date().toISOString().replace(/[:.]/g, '-')}-before-restore`);
    ensureDirectory(safetyRoot);
    const entries = [
      this.snapshot(this.paths.settingsPath, path.join(safetyRoot, 'settings.json')),
      this.snapshot(this.paths.activeThemePath, path.join(safetyRoot, 'active.omp.json')),
      this.snapshot(this.paths.terminalSettingsPath, path.join(safetyRoot, 'terminal-settings.json')),
      this.snapshot(this.paths.statePath, path.join(safetyRoot, 'install-state.json')),
      this.snapshot(this.paths.customProfilePath, path.join(safetyRoot, 'custom-profile.ps1')),
    ];
    const previousStartup = isLaunchAtStartupEnabled();
    try {
      writeAtomic(this.paths.settingsPath, restoredSettingsContent);
      writeAtomic(this.paths.customProfilePath, restoredCustomProfileContent);
      writeAtomic(this.paths.activeThemePath, themeContent);
      writeAtomic(this.paths.terminalSettingsPath, terminalContent);
      if (stateContent) writeAtomic(this.paths.statePath, stateContent);
      setLaunchAtStartup(restoredSettings.startup.enabled);
      appendLog(this.paths.logPath, `Backup restaurado: ${latest.id}`);
    } catch (error) {
      this.restore(entries);
      setLaunchAtStartup(previousStartup);
      appendLog(this.paths.logPath, `Falha ao restaurar backup; rollback executado. ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
    return { settings: restoredSettings, revision: this.revision(), appliedAt: new Date().toISOString() };
  }

  syncStartupPreference(): void {
    if (process.env.POWERSHELL_CONFIG_DISABLE_STARTUP_SYNC === '1') return;
    const expected = this.settingsService.read().startup.enabled;
    if (isLaunchAtStartupEnabled() !== expected) setLaunchAtStartup(expected);
  }

  async openTerminal(): Promise<void> {
    const executable = resolveWindowsExecutable('wt.exe', [
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'wt.exe') : null,
    ]);
    await execFileSafe(executable, ['-p', 'PowerShell'], 10_000);
  }

  async openLogs(): Promise<void> {
    ensureDirectory(path.dirname(this.paths.logPath));
    if (!fs.existsSync(this.paths.logPath)) writeAtomic(this.paths.logPath, '');
    const error = await shell.openPath(path.dirname(this.paths.logPath));
    if (error) throw new Error(error);
  }

  private async validateManagedProfileSyntax(): Promise<void> {
    if (!fs.existsSync(this.paths.managedProfilePath)) {
      throw new Error(`Perfil gerenciado não encontrado: ${this.paths.managedProfilePath}`);
    }
    await this.validatePowerShellFileSyntax(this.paths.managedProfilePath);
  }

  private async validateGeneratedProfileSyntax(content: string): Promise<void> {
    ensureDirectory(path.dirname(this.paths.customProfilePath));
    const temporaryPath = path.join(
      path.dirname(this.paths.customProfilePath),
      `.custom-profile-${process.pid}-${randomUUID()}.validation.ps1`,
    );
    try {
      writeAtomic(temporaryPath, content);
      await this.validatePowerShellFileSyntax(temporaryPath);
    } finally {
      fs.rmSync(temporaryPath, { force: true });
    }
  }

  private async validatePowerShellFileSyntax(filePath: string): Promise<void> {
    const executable = resolveWindowsExecutable('pwsh.exe', [
      process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'PowerShell', '7', 'pwsh.exe') : null,
    ]);
    const parser = "$filePath=[Environment]::GetEnvironmentVariable('POWERSHELL_CONFIG_PROFILE_TO_VALIDATE'); $tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseFile($filePath,[ref]$tokens,[ref]$errors) | Out-Null; if ($errors.Count) { $errors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }; exit 1 }";
    await execFileSafe(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', parser], 10_000, {
      ...process.env,
      POWERSHELL_CONFIG_PROFILE_TO_VALIDATE: filePath,
    });
  }

  private snapshot(target: string, backup: string): SnapshotEntry {
    const existed = copyIfExists(target, backup);
    return { target, backup, existed };
  }

  private listBackups(): BackupInfo[] {
    if (!fs.existsSync(this.paths.backupDirectory)) return [];
    return fs.readdirSync(this.paths.backupDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(this.paths.backupDirectory, entry.name, 'settings.json')))
      .map((entry) => {
        const fullPath = path.join(this.paths.backupDirectory, entry.name);
        return { id: entry.name, createdAt: fs.statSync(fullPath).birthtime.toISOString() };
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  private restore(entries: SnapshotEntry[]): void {
    for (const entry of entries.reverse()) {
      if (entry.existed) {
        ensureDirectory(path.dirname(entry.target));
        fs.copyFileSync(entry.backup, entry.target);
      } else {
        fs.rmSync(entry.target, { force: true });
      }
    }
  }
}
