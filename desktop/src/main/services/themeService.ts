import { dialog } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ThemeInfo } from '../../shared/settings.js';
import type { AppPaths } from './paths.js';
import { ensureDirectory, hashFile, readUtf8, sha256, writeAtomic } from './fileService.js';
import { execFileSafe, resolveWindowsExecutable } from './processService.js';
import type { PortableTheme } from './portabilityService.js';

interface ThemeRecord extends ThemeInfo {
  filePath: string;
}

function safeThemeName(filePath: string): string {
  return path.basename(filePath).replace(/\.omp\.json$/i, '');
}

export class ThemeService {
  private catalog = new Map<string, ThemeRecord>();

  constructor(private readonly paths: AppPaths) {}

  private installedThemesDirectory(): string | null {
    const candidates = [
      process.env.POSH_THEMES_PATH,
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'oh-my-posh', 'themes') : null,
    ].filter((candidate): candidate is string => Boolean(candidate));
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
  }

  list(): ThemeInfo[] {
    this.catalog.clear();
    if (fs.existsSync(this.paths.builtinThemePath)) {
      this.catalog.set('builtin:takuya', { id: 'builtin:takuya', name: 'takuya', source: 'builtin', filePath: this.paths.builtinThemePath });
    }

    const installedDirectory = this.installedThemesDirectory();
    if (installedDirectory) {
      for (const entry of fs.readdirSync(installedDirectory, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.omp.json')) continue;
        const name = safeThemeName(entry.name);
        const id = `installed:${name}`;
        this.catalog.set(id, { id, name, source: 'installed', filePath: path.join(installedDirectory, entry.name) });
      }
    }

    ensureDirectory(this.paths.importedThemesDirectory);
    for (const entry of fs.readdirSync(this.paths.importedThemesDirectory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.omp.json')) continue;
      const name = safeThemeName(entry.name).replace(/-[a-f0-9]{12}$/i, '');
      const digest = path.basename(entry.name).match(/-([a-f0-9]{12})\.omp\.json$/i)?.[1] ?? sha256(entry.name).slice(0, 12);
      const id = `imported:${digest}`;
      this.catalog.set(id, { id, name, source: 'imported', filePath: path.join(this.paths.importedThemesDirectory, entry.name) });
    }

    return [...this.catalog.values()]
      .map(({ filePath: _filePath, ...theme }) => theme)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  resolve(themeId: string): ThemeRecord {
    if (!this.catalog.size) this.list();
    const record = this.catalog.get(themeId);
    if (!record) throw new Error('Tema não encontrado ou não permitido. Recarregue a galeria.');
    return record;
  }

  readTheme(themeId: string): Buffer {
    const record = this.resolve(themeId);
    const content = fs.readFileSync(record.filePath);
    JSON.parse(content.toString('utf8'));
    return content;
  }

  portableThemes(requiredThemeIds: string[]): PortableTheme[] {
    this.list();
    const required = new Set(requiredThemeIds);
    const records = [...this.catalog.values()].filter((record) =>
      record.source === 'imported' || (required.has(record.id) && record.source !== 'builtin'));
    return records.map((record) => {
      const content = fs.readFileSync(record.filePath, 'utf8');
      return {
        originalId: record.id,
        name: record.name,
        content,
        sha256: sha256(content),
      };
    });
  }

  async validatePortableTheme(theme: PortableTheme): Promise<void> {
    const digest = sha256(theme.content);
    const configPath = path.join(this.paths.previewCacheDirectory, `.portable-${digest}.omp.json`);
    const outputPath = path.join(this.paths.previewCacheDirectory, `.portable-${digest}.png`);
    ensureDirectory(this.paths.previewCacheDirectory);
    writeAtomic(configPath, theme.content);
    try {
      await execFileSafe(this.ohMyPoshExecutable(), ['config', 'export', 'image', '--config', configPath, '--output', outputPath], 30_000);
    } finally {
      fs.rmSync(configPath, { force: true });
      fs.rmSync(outputPath, { force: true });
    }
  }

  installPortableThemes(themes: PortableTheme[]): { createdPaths: string[]; idByOriginalId: Map<string, string> } {
    ensureDirectory(this.paths.importedThemesDirectory);
    const createdPaths: string[] = [];
    const idByOriginalId = new Map<string, string>();
    try {
      for (const theme of themes) {
        const digest = theme.sha256.slice(0, 12);
        const name = theme.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'tema-importado';
        const destination = path.join(this.paths.importedThemesDirectory, `${name}-${digest}.omp.json`);
        if (!fs.existsSync(destination)) {
          writeAtomic(destination, theme.content);
          createdPaths.push(destination);
        } else if (sha256(fs.readFileSync(destination)) !== theme.sha256) {
          throw new Error(`O tema existente "${theme.name}" não corresponde ao pacote importado.`);
        }
        idByOriginalId.set(theme.originalId, `imported:${digest}`);
      }
      this.list();
      return { createdPaths, idByOriginalId };
    } catch (error) {
      for (const createdPath of createdPaths) fs.rmSync(createdPath, { force: true });
      this.list();
      throw error;
    }
  }

  ensureActiveTheme(): void {
    if (fs.existsSync(this.paths.activeThemePath)) return;
    const source = this.resolve('builtin:takuya').filePath;
    writeAtomic(this.paths.activeThemePath, fs.readFileSync(source));
  }

  // Repara active.omp.json sozinho quando desatualizado; só sobrescreve se o hash em disco bate com o último gravado por nós (senão o usuário editou por fora).
  syncManagedTheme(themeId: string): boolean {
    const existedBefore = fs.existsSync(this.paths.activeThemePath);
    this.ensureActiveTheme();
    if (!existedBefore) return true;

    let desiredContent: Buffer;
    try {
      desiredContent = this.readTheme(themeId);
    } catch {
      return false;
    }
    const currentContent = fs.readFileSync(this.paths.activeThemePath);
    const desiredHash = sha256(desiredContent);
    const currentHash = sha256(currentContent);
    if (desiredHash === currentHash) return false;

    const expectedHash = this.readManagedThemeHash();
    if (!expectedHash || expectedHash.toLowerCase() !== currentHash.toLowerCase()) return false;

    writeAtomic(this.paths.activeThemePath, desiredContent);
    this.writeManagedThemeHash(desiredHash.toUpperCase());
    return true;
  }

  private readManagedThemeHash(): string | null {
    if (!fs.existsSync(this.paths.statePath)) return null;
    try {
      const state = JSON.parse(fs.readFileSync(this.paths.statePath, 'utf8')) as {
        ManagedConfig?: { ThemeInstalledHash?: unknown };
      };
      const hash = state.ManagedConfig?.ThemeInstalledHash;
      return typeof hash === 'string' ? hash : null;
    } catch {
      return null;
    }
  }

  private writeManagedThemeHash(hash: string): void {
    if (!fs.existsSync(this.paths.statePath)) return;
    try {
      const state = JSON.parse(fs.readFileSync(this.paths.statePath, 'utf8')) as { ManagedConfig?: Record<string, unknown> };
      if (!state.ManagedConfig) return;
      state.ManagedConfig.ThemeInstalledHash = hash;
      writeAtomic(this.paths.statePath, `${JSON.stringify(state, null, 2)}\n`);
    } catch {
      // install-state.json ilegível: o self-heal do tema simplesmente não atualiza o rastreamento nesta execução.
    }
  }

  async preview(themeId: string): Promise<string> {
    const record = this.resolve(themeId);
    const cacheKey = `${hashFile(record.filePath)}-${await this.ohMyPoshVersion()}`;
    const outputPath = path.join(this.paths.previewCacheDirectory, `${cacheKey}.png`);
    ensureDirectory(this.paths.previewCacheDirectory);
    if (!fs.existsSync(outputPath)) {
      await execFileSafe(this.ohMyPoshExecutable(), ['config', 'export', 'image', '--config', record.filePath, '--output', outputPath], 30_000);
    }
    const image = fs.readFileSync(outputPath);
    if (image.length > 5 * 1024 * 1024) throw new Error('Prévia do tema excedeu o limite de 5 MB.');
    return `data:image/png;base64,${image.toString('base64')}`;
  }

  async importWithDialog(): Promise<ThemeInfo | null> {
    const result = await dialog.showOpenDialog({
      title: 'Importar tema Oh My Posh',
      properties: ['openFile'],
      filters: [{ name: 'Tema Oh My Posh', extensions: ['json'] }],
    });
    if (result.canceled || result.filePaths.length !== 1) return null;
    const source = result.filePaths[0];
    const stat = fs.statSync(source);
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error('O tema deve ser um arquivo JSON de até 2 MB.');
    const content = readUtf8(source);
    if (!content) throw new Error('Tema vazio.');
    JSON.parse(content);
    const digest = sha256(content).slice(0, 12);
    const name = safeThemeName(source).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'tema-importado';
    const destination = path.join(this.paths.importedThemesDirectory, `${name}-${digest}.omp.json`);
    ensureDirectory(this.paths.importedThemesDirectory);
    writeAtomic(destination, content);
    try {
      this.list();
      const theme = this.catalog.get(`imported:${digest}`);
      if (!theme) throw new Error('Tema importado não pôde ser catalogado.');
      await this.preview(theme.id);
      const { filePath: _filePath, ...publicTheme } = theme;
      return publicTheme;
    } catch (error) {
      fs.rmSync(destination, { force: true });
      this.list();
      throw error;
    }
  }

  private async ohMyPoshVersion(): Promise<string> {
    try {
      return (await execFileSafe(this.ohMyPoshExecutable(), ['version'], 5_000)).stdout.replace(/[^a-zA-Z0-9.-]/g, '_');
    } catch {
      return `unavailable-${os.platform()}`;
    }
  }

  private ohMyPoshExecutable(): string {
    const themesDirectory = this.installedThemesDirectory();
    return resolveWindowsExecutable('oh-my-posh.exe', [
      themesDirectory ? path.join(path.dirname(themesDirectory), 'bin', 'oh-my-posh.exe') : null,
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'oh-my-posh', 'bin', 'oh-my-posh.exe') : null,
    ]);
  }
}
