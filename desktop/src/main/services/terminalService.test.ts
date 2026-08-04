import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../../shared/settings.js';
import type { AppPaths } from './paths.js';
import { TerminalService } from './terminalService.js';

const temporaryDirectories: string[] = [];

function createPaths(content: string): AppPaths {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'powershell-config-terminal-'));
  temporaryDirectories.push(root);
  const terminalSettingsPath = path.join(root, 'settings.json');
  fs.writeFileSync(terminalSettingsPath, content, 'utf8');
  return {
    installRoot: root,
    configDirectory: path.join(root, 'config'),
    settingsPath: path.join(root, 'config', 'settings.json'),
    activeThemePath: path.join(root, 'active.json'),
    importedThemesDirectory: path.join(root, 'imported'),
    previewCacheDirectory: path.join(root, 'cache'),
    backupDirectory: path.join(root, 'backup'),
    statePath: path.join(root, 'state.json'),
    logPath: path.join(root, 'app.log'),
    terminalSettingsPath,
    profilePath: path.join(root, 'profile.ps1'),
    managedProfilePath: path.join(root, 'managed-profile.ps1'),
    builtinThemePath: path.join(root, 'takuya.json'),
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('TerminalService', () => {
  it('preserva comentário, propriedade desconhecida e atalho externo', () => {
    const paths = createPaths(`{
      // comentário do usuário
      "theme": "dark",
      "profiles": { "defaults": { "opacity": 99 } },
      "actions": [{ "command": "newTab", "keys": "ctrl+t" }],
    }`);
    const service = new TerminalService(paths);
    const updated = service.buildContent(defaultSettings);

    expect(updated).toContain('// comentário do usuário');
    expect(updated).toContain('"theme": "dark"');
    expect(updated).toContain('"ctrl+t"');
    expect(updated).toContain('"opacity": 80');
    expect(updated).toContain('"face": "Hack NF"');
  });

  it('lista esquemas internos e customizados sem duplicar', () => {
    const paths = createPaths('{ "schemes": [{ "name": "Meu Tema" }, { "name": "Campbell" }] }');
    const schemes = new TerminalService(paths).listColorSchemes();
    expect(schemes).toContain('Meu Tema');
    expect(schemes.filter((item) => item === 'Campbell')).toHaveLength(1);
  });

  it('interrompe diante de JSONC inválido', () => {
    const paths = createPaths('{ inválido');
    expect(() => new TerminalService(paths).buildContent(defaultSettings)).toThrow(/inválido/);
  });
});
