import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppPaths } from './paths.js';
import { sha256 } from './fileService.js';

vi.mock('electron', () => ({ dialog: {} }));

import { ThemeService } from './themeService.js';

const directories: string[] = [];

function createService(): { service: ThemeService; imported: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'powershell-config-portable-themes-'));
  directories.push(root);
  const imported = path.join(root, 'imported');
  return {
    imported,
    service: new ThemeService({
      importedThemesDirectory: imported,
      previewCacheDirectory: path.join(root, 'cache'),
      builtinThemePath: path.join(root, 'builtin.json'),
    } as AppPaths),
  };
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('ThemeService portable themes', () => {
  it('remove temas adicionados se a mesclagem falhar no meio da transação', () => {
    const { service, imported } = createService();
    fs.mkdirSync(imported, { recursive: true });
    const conflictingContent = '{"conflict":true}';
    const expectedContent = '{"expected":true}';
    const expectedHash = sha256(expectedContent);
    const conflictingPath = path.join(imported, `conflict-${expectedHash.slice(0, 12)}.omp.json`);
    fs.writeFileSync(conflictingPath, conflictingContent, 'utf8');

    expect(() => service.installPortableThemes([
      { originalId: 'installed:first', name: 'first', content: '{}', sha256: sha256('{}') },
      { originalId: 'installed:conflict', name: 'conflict', content: expectedContent, sha256: expectedHash },
    ])).toThrow(/não corresponde/);

    expect(fs.existsSync(path.join(imported, `first-${sha256('{}').slice(0, 12)}.omp.json`))).toBe(false);
    expect(fs.readFileSync(conflictingPath, 'utf8')).toBe(conflictingContent);
  });
});
