import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppPaths } from './paths.js';
import { sha256 } from './fileService.js';

vi.mock('electron', () => ({ dialog: {} }));

import { ThemeService } from './themeService.js';

const directories: string[] = [];

function createService(): { service: ThemeService; paths: AppPaths } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'powershell-config-theme-sync-'));
  directories.push(root);
  const paths = {
    importedThemesDirectory: path.join(root, 'imported'),
    previewCacheDirectory: path.join(root, 'cache'),
    builtinThemePath: path.join(root, 'builtin.omp.json'),
    activeThemePath: path.join(root, 'active.omp.json'),
    statePath: path.join(root, 'install-state.json'),
  } as AppPaths;
  return { service: new ThemeService(paths), paths };
}

function writeState(statePath: string, themeInstalledHash: string | null): void {
  fs.writeFileSync(statePath, JSON.stringify({ ManagedConfig: themeInstalledHash === null ? null : { ThemeInstalledHash: themeInstalledHash } }), 'utf8');
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('ThemeService.syncManagedTheme', () => {
  it('cria active.omp.json a partir do tema builtin quando o arquivo ainda não existe', () => {
    const { service, paths } = createService();
    fs.writeFileSync(paths.builtinThemePath, '{"builtin":true}', 'utf8');

    const changed = service.syncManagedTheme('builtin:takuya');

    expect(changed).toBe(true);
    expect(fs.readFileSync(paths.activeThemePath, 'utf8')).toBe('{"builtin":true}');
  });

  it('resincroniza sozinho quando o hash em disco bate com o último hash gravado por nós', () => {
    const { service, paths } = createService();
    fs.writeFileSync(paths.builtinThemePath, '{"builtin":"v2"}', 'utf8');
    const outdatedContent = '{"builtin":"v1"}';
    fs.writeFileSync(paths.activeThemePath, outdatedContent, 'utf8');
    writeState(paths.statePath, sha256(outdatedContent).toUpperCase());

    const changed = service.syncManagedTheme('builtin:takuya');

    expect(changed).toBe(true);
    expect(fs.readFileSync(paths.activeThemePath, 'utf8')).toBe('{"builtin":"v2"}');
    const state = JSON.parse(fs.readFileSync(paths.statePath, 'utf8'));
    expect(state.ManagedConfig.ThemeInstalledHash).toBe(sha256('{"builtin":"v2"}').toUpperCase());
  });

  it('preserva o arquivo quando o hash em disco não bate com o rastreado (edição externa)', () => {
    const { service, paths } = createService();
    fs.writeFileSync(paths.builtinThemePath, '{"builtin":"v2"}', 'utf8');
    const editedContent = '{"editado":"pelo usuario"}';
    fs.writeFileSync(paths.activeThemePath, editedContent, 'utf8');
    writeState(paths.statePath, sha256('{"builtin":"v1"}').toUpperCase());

    const changed = service.syncManagedTheme('builtin:takuya');

    expect(changed).toBe(false);
    expect(fs.readFileSync(paths.activeThemePath, 'utf8')).toBe(editedContent);
  });

  it('preserva o arquivo quando não há rastreamento de hash disponível', () => {
    const { service, paths } = createService();
    fs.writeFileSync(paths.builtinThemePath, '{"builtin":"v2"}', 'utf8');
    const outdatedContent = '{"builtin":"v1"}';
    fs.writeFileSync(paths.activeThemePath, outdatedContent, 'utf8');

    const changed = service.syncManagedTheme('builtin:takuya');

    expect(changed).toBe(false);
    expect(fs.readFileSync(paths.activeThemePath, 'utf8')).toBe(outdatedContent);
  });

  it('não escreve nada quando o conteúdo já está sincronizado', () => {
    const { service, paths } = createService();
    fs.writeFileSync(paths.builtinThemePath, '{"builtin":"v2"}', 'utf8');
    fs.writeFileSync(paths.activeThemePath, '{"builtin":"v2"}', 'utf8');
    writeState(paths.statePath, sha256('{"builtin":"v1"}').toUpperCase());

    const changed = service.syncManagedTheme('builtin:takuya');

    expect(changed).toBe(false);
  });
});
