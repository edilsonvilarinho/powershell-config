import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../../shared/settings.js';
import type { AppPaths } from './paths.js';
import { sha256 } from './fileService.js';
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
    userStatePath: path.join(root, 'config', 'user-state.json'),
    activeThemePath: path.join(root, 'active.json'),
    importedThemesDirectory: path.join(root, 'imported'),
    previewCacheDirectory: path.join(root, 'cache'),
    backupDirectory: path.join(root, 'backup'),
    statePath: path.join(root, 'state.json'),
    logPath: path.join(root, 'app.log'),
    terminalSettingsPath,
    profilePath: path.join(root, 'profile.ps1'),
    managedProfilePath: path.join(root, 'managed-profile.ps1'),
    customProfilePath: path.join(root, 'config', 'custom-profile.ps1'),
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

  it('lista esquema fornecido pelo fragmento gerenciado do instalador', () => {
    const paths = createPaths('{ "profiles": { "defaults": { "colorScheme": "One Half Dark (modded)" } } }');
    const fragmentPath = path.join(paths.installRoot, 'powershell-config-fragment.json');
    fs.writeFileSync(fragmentPath, '{ "schemes": [{ "name": "One Half Dark (modded)" }] }', 'utf8');
    fs.writeFileSync(paths.statePath, JSON.stringify({ TerminalFragment: { Path: fragmentPath } }), 'utf8');

    expect(new TerminalService(paths).listColorSchemes()).toContain('One Half Dark (modded)');
  });

  it('não aceita como disponível esquema cujo fragmento gerenciado não existe', () => {
    const paths = createPaths('{ "profiles": { "defaults": { "colorScheme": "Esquema ausente" } } }');
    fs.writeFileSync(paths.statePath, JSON.stringify({
      TerminalFragment: { Path: path.join(paths.installRoot, 'fragmento-ausente.json') },
    }), 'utf8');

    expect(new TerminalService(paths).listColorSchemes()).not.toContain('Esquema ausente');
  });

  it('interrompe diante de JSONC inválido', () => {
    const paths = createPaths('{ inválido');
    expect(() => new TerminalService(paths).buildContent(defaultSettings)).toThrow(/inválido/);
  });

  it('atualiza hash do tema em install-state.json quando o conteúdo do tema é informado', () => {
    const paths = createPaths('{}');
    fs.writeFileSync(paths.statePath, JSON.stringify({ Terminal: {}, ManagedConfig: {} }), 'utf8');
    const service = new TerminalService(paths);
    const themeContent = Buffer.from('{"tema":"novo"}', 'utf8');

    const updated = service.updateInstallerState('{}', defaultSettings, themeContent);

    expect(updated).not.toBeNull();
    const state = JSON.parse(updated as string);
    expect(state.ManagedConfig.ThemeInstalledHash).toBe(sha256(themeContent).toUpperCase());
  });

  it('não altera ManagedConfig quando o conteúdo do tema não é informado', () => {
    const paths = createPaths('{}');
    fs.writeFileSync(paths.statePath, JSON.stringify({ Terminal: {}, ManagedConfig: { ThemeInstalledHash: 'PRESERVADO' } }), 'utf8');
    const service = new TerminalService(paths);

    const updated = service.updateInstallerState('{}', defaultSettings);

    const state = JSON.parse(updated as string);
    expect(state.ManagedConfig.ThemeInstalledHash).toBe('PRESERVADO');
  });

  it('escreve os overrides de aparência quando definidos', () => {
    const paths = createPaths('{}');
    const service = new TerminalService(paths);
    const settings = {
      ...defaultSettings,
      terminal: {
        ...defaultSettings.terminal,
        foreground: '#DCDFE4',
        background: '#001B26',
        selectionBackground: '#FFFFFF',
        cursorColor: '#FF00FF',
        cursorHeight: 40,
        padding: '8, 8, 8, 8',
        scrollbarState: 'hidden' as const,
      },
    };

    const updated = service.buildContent(settings);

    expect(updated).toContain('"foreground": "#DCDFE4"');
    expect(updated).toContain('"background": "#001B26"');
    expect(updated).toContain('"selectionBackground": "#FFFFFF"');
    expect(updated).toContain('"cursorColor": "#FF00FF"');
    expect(updated).toContain('"cursorHeight": 40');
    expect(updated).toContain('"padding": "8, 8, 8, 8"');
    expect(updated).toContain('"scrollbarState": "hidden"');
  });

  it('remove a chave de override quando o campo volta a null e ela já existia', () => {
    const paths = createPaths('{ "profiles": { "defaults": { "foreground": "#DCDFE4", "opacity": 80 } } }');
    const service = new TerminalService(paths);

    const updated = service.buildContent(defaultSettings);

    expect(updated).not.toContain('foreground');
    expect(updated).toContain('"opacity": 80');
  });

  it('não gera edição indevida quando o campo é null e a chave nunca existiu (idempotência)', () => {
    const paths = createPaths('{ "profiles": { "defaults": { "opacity": 80 } } }');
    const service = new TerminalService(paths);

    expect(() => service.buildContent(defaultSettings)).not.toThrow();
    const updated = service.buildContent(defaultSettings);
    expect(updated).not.toContain('foreground');
  });

  it('escreve o efeito retrô como chave única com ponto literal, não como objeto aninhado', () => {
    const paths = createPaths('{}');
    const service = new TerminalService(paths);
    const settings = { ...defaultSettings, terminal: { ...defaultSettings.terminal, retroTerminalEffect: true } };

    const updated = service.buildContent(settings);
    const parsed = JSON.parse(updated) as { profiles: { defaults: Record<string, unknown> } };

    expect(parsed.profiles.defaults['experimental.retroTerminalEffect']).toBe(true);
    expect(parsed.profiles.defaults.experimental).toBeUndefined();
    expect(updated).toContain('"experimental.retroTerminalEffect": true');
  });

  it('converte fontFeatures/fontAxes de array para objeto e remove quando vazios', () => {
    const paths = createPaths('{ "profiles": { "defaults": { "font": { "face": "Hack NF", "features": { "liga": 0 } } } } }');
    const service = new TerminalService(paths);
    const settings = {
      ...defaultSettings,
      terminal: { ...defaultSettings.terminal, fontAxes: [{ tag: 'wght', value: 200 }], fontFeatures: [] },
    };

    const updated = service.buildContent(settings);
    const parsed = JSON.parse(updated) as { profiles: { defaults: { font: Record<string, unknown> } } };

    expect(parsed.profiles.defaults.font.axes).toEqual({ wght: 200 });
    expect(parsed.profiles.defaults.font.features).toBeUndefined();
  });

  it('getColorSchemeColors retorna as cores de um esquema definido explicitamente no settings.json do usuário', () => {
    const paths = createPaths('{ "schemes": [{ "name": "Meu Tema", "background": "#001B26", "foreground": "#DCDFE4", "selectionBackground": "#FFFFFF" }] }');
    const colors = new TerminalService(paths).getColorSchemeColors('Meu Tema');
    expect(colors).toEqual({ background: '#001B26', foreground: '#DCDFE4', selectionBackground: '#FFFFFF' });
  });

  it('getColorSchemeColors retorna null para esquema built-in sem entrada explícita em nenhum arquivo', () => {
    const paths = createPaths('{}');
    expect(new TerminalService(paths).getColorSchemeColors('Campbell')).toBeNull();
  });

  it('getColorSchemeColors busca no fragmento gerenciado quando o esquema não está no settings.json do usuário', () => {
    const paths = createPaths('{}');
    const fragmentPath = path.join(paths.installRoot, 'powershell-config-fragment.json');
    fs.writeFileSync(fragmentPath, '{ "schemes": [{ "name": "One Half Dark (modded)", "background": "#0A0A0A", "foreground": "#EEEEEE", "selectionBackground": "#333333" }] }', 'utf8');
    fs.writeFileSync(paths.statePath, JSON.stringify({ TerminalFragment: { Path: fragmentPath } }), 'utf8');

    const colors = new TerminalService(paths).getColorSchemeColors('One Half Dark (modded)');
    expect(colors).toEqual({ background: '#0A0A0A', foreground: '#EEEEEE', selectionBackground: '#333333' });
  });

  it('updateInstallerState grava os novos campos de aparência em ManagedValues', () => {
    const paths = createPaths('{}');
    fs.writeFileSync(paths.statePath, JSON.stringify({ Terminal: {}, ManagedConfig: {} }), 'utf8');
    const service = new TerminalService(paths);
    const settings = { ...defaultSettings, terminal: { ...defaultSettings.terminal, foreground: '#DCDFE4', cursorShape: 'vintage' as const } };

    const updated = service.updateInstallerState('{}', settings);
    const state = JSON.parse(updated as string);

    expect(state.Terminal.ManagedValues.foreground).toBe('#DCDFE4');
    expect(state.Terminal.ManagedValues.cursorShape).toBe('vintage');
    expect(state.Terminal.ManagedValues['experimental.retroTerminalEffect']).toBe(false);
  });
});
