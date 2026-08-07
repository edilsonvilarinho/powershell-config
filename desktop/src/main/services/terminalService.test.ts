import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultSettings, emptyTerminalProfileAdvanced, emptyTerminalProfileAppearance, type TerminalProfileConfig } from '../../shared/settings.js';
import type { AppPaths } from './paths.js';
import { sha256 } from './fileService.js';
import { TerminalService } from './terminalService.js';

const temporaryDirectories: string[] = [];

function makeProfile(overrides: Partial<TerminalProfileConfig> = {}): TerminalProfileConfig {
  return {
    id: 'perfil-1',
    guid: '{11111111-1111-1111-1111-111111111111}',
    name: 'Dev Shell',
    commandline: null,
    startingDirectory: null,
    icon: null,
    tabTitle: null,
    elevate: false,
    hidden: false,
    appearance: { ...emptyTerminalProfileAppearance },
    advanced: { ...emptyTerminalProfileAdvanced },
    ...overrides,
  };
}

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

  describe('profiles.list (perfis múltiplos)', () => {
    it('insere um perfil novo no fim de profiles.list quando o arquivo ainda não tem a chave', () => {
      const paths = createPaths('{}');
      const service = new TerminalService(paths);
      const settings = { ...defaultSettings, terminalProfiles: [makeProfile({ name: 'TRABALHO', commandline: 'pwsh.exe -NoExit' })] };

      const updated = service.buildContent(settings, []);
      const parsed = JSON.parse(updated) as { profiles: { list: Array<Record<string, unknown>> } };

      expect(parsed.profiles.list).toHaveLength(1);
      expect(parsed.profiles.list[0].guid).toBe('{11111111-1111-1111-1111-111111111111}');
      expect(parsed.profiles.list[0].name).toBe('TRABALHO');
      expect(parsed.profiles.list[0].commandline).toBe('pwsh.exe -NoExit');
    });

    it('preserva perfis nativos/dinâmicos preexistentes (WSL/Git Bash) ao inserir um perfil novo', () => {
      const paths = createPaths(`{
        "profiles": {
          "defaults": { "opacity": 80 },
          "list": [
            { "guid": "{wsl-guid}", "name": "Ubuntu-20.04", "source": "Windows.Terminal.Wsl" },
            { "guid": "{gitbash-guid}", "name": "Git Bash" }
          ]
        }
      }`);
      const service = new TerminalService(paths);
      const settings = { ...defaultSettings, terminalProfiles: [makeProfile()] };

      const updated = service.buildContent(settings, []);
      const parsed = JSON.parse(updated) as { profiles: { list: Array<Record<string, unknown>> } };

      expect(parsed.profiles.list).toHaveLength(3);
      expect(parsed.profiles.list[0].name).toBe('Ubuntu-20.04');
      expect(parsed.profiles.list[0].source).toBe('Windows.Terminal.Wsl');
      expect(parsed.profiles.list[1].name).toBe('Git Bash');
      expect(parsed.profiles.list[2].guid).toBe('{11111111-1111-1111-1111-111111111111}');
    });

    it('atualiza um perfil existente campo a campo sem afetar os demais perfis geridos', () => {
      const paths = createPaths('{}');
      const service = new TerminalService(paths);
      const other = makeProfile({ id: 'perfil-2', guid: '{22222222-2222-2222-2222-222222222222}', name: 'Outro' });
      const first = makeProfile({ name: 'Nome original' });

      const afterCreate = service.buildContent({ ...defaultSettings, terminalProfiles: [first, other] }, []);
      fs.writeFileSync(paths.terminalSettingsPath, afterCreate, 'utf8');

      const renamed = { ...first, name: 'Nome renomeado' };
      const updated = service.buildContent(
        { ...defaultSettings, terminalProfiles: [renamed, other] },
        [first.guid, other.guid],
      );
      const parsed = JSON.parse(updated) as { profiles: { list: Array<Record<string, unknown>> } };

      expect(parsed.profiles.list.find((p) => p.guid === first.guid)?.name).toBe('Nome renomeado');
      expect(parsed.profiles.list.find((p) => p.guid === other.guid)?.name).toBe('Outro');
    });

    it('remove só o perfil que saiu de previousProfileGuids, preservando os demais e os nativos', () => {
      const paths = createPaths(`{
        "profiles": { "list": [{ "guid": "{wsl-guid}", "name": "Ubuntu", "source": "Windows.Terminal.Wsl" }] }
      }`);
      const service = new TerminalService(paths);
      const removed = makeProfile({ name: 'Será removido' });
      const kept = makeProfile({ id: 'perfil-2', guid: '{22222222-2222-2222-2222-222222222222}', name: 'Fica' });

      const afterCreate = service.buildContent({ ...defaultSettings, terminalProfiles: [removed, kept] }, []);
      fs.writeFileSync(paths.terminalSettingsPath, afterCreate, 'utf8');

      const updated = service.buildContent(
        { ...defaultSettings, terminalProfiles: [kept] },
        [removed.guid, kept.guid],
      );
      const parsed = JSON.parse(updated) as { profiles: { list: Array<Record<string, unknown>> } };

      expect(parsed.profiles.list.some((p) => p.guid === removed.guid)).toBe(false);
      expect(parsed.profiles.list.some((p) => p.guid === kept.guid)).toBe(true);
      expect(parsed.profiles.list.some((p) => p.name === 'Ubuntu')).toBe(true);
    });

    it('remove todos os perfis geridos quando terminalProfiles volta a [] (cenário restoreDefaults)', () => {
      const paths = createPaths('{}');
      const service = new TerminalService(paths);
      const profile = makeProfile();

      const afterCreate = service.buildContent({ ...defaultSettings, terminalProfiles: [profile] }, []);
      fs.writeFileSync(paths.terminalSettingsPath, afterCreate, 'utf8');

      const updated = service.buildContent({ ...defaultSettings, terminalProfiles: [] }, [profile.guid]);
      const parsed = JSON.parse(updated) as { profiles: { list: unknown[] } };

      expect(parsed.profiles.list).toHaveLength(0);
    });

    it('é idempotente: aplicar o mesmo settings duas vezes não duplica nem altera o array', () => {
      const paths = createPaths('{}');
      const service = new TerminalService(paths);
      const profile = makeProfile();
      const settings = { ...defaultSettings, terminalProfiles: [profile] };

      const first = service.buildContent(settings, []);
      fs.writeFileSync(paths.terminalSettingsPath, first, 'utf8');
      const second = service.buildContent(settings, [profile.guid]);

      expect(JSON.parse(second).profiles.list).toHaveLength(1);
      expect(JSON.parse(second)).toEqual(JSON.parse(first));
    });

    it('serializa ícone emoji/arquivo como string simples e remove a chave quando "nenhum"', () => {
      const paths = createPaths('{}');
      const service = new TerminalService(paths);
      const emoji = makeProfile({ icon: { kind: 'emoji', value: '🚀' } });
      const file = makeProfile({ id: 'perfil-2', guid: '{22222222-2222-2222-2222-222222222222}', icon: { kind: 'file', path: 'C:\\icons\\a.ico' } });
      const none = makeProfile({ id: 'perfil-3', guid: '{33333333-3333-3333-3333-333333333333}', icon: { kind: 'none' } });

      const updated = service.buildContent({ ...defaultSettings, terminalProfiles: [emoji, file, none] }, []);
      const parsed = JSON.parse(updated) as { profiles: { list: Array<Record<string, unknown>> } };

      expect(parsed.profiles.list[0].icon).toBe('🚀');
      expect(parsed.profiles.list[1].icon).toBe('C:\\icons\\a.ico');
      expect(parsed.profiles.list[2].icon).toBeUndefined();
    });

    it('grava experimental.useAtlasEngine como chave única com ponto literal', () => {
      const paths = createPaths('{}');
      const service = new TerminalService(paths);
      const profile = makeProfile({ advanced: { ...emptyTerminalProfileAdvanced, useAtlasEngine: true } });

      const updated = service.buildContent({ ...defaultSettings, terminalProfiles: [profile] }, []);
      const parsed = JSON.parse(updated) as { profiles: { list: Array<Record<string, unknown>> } };

      expect(parsed.profiles.list[0]['experimental.useAtlasEngine']).toBe(true);
      expect(parsed.profiles.list[0].experimental).toBeUndefined();
    });

    it('converte fontFeatures/fontAxes do perfil de array para objeto', () => {
      const paths = createPaths('{}');
      const service = new TerminalService(paths);
      const profile = makeProfile({
        appearance: { ...emptyTerminalProfileAppearance, fontFeatures: [{ tag: 'ss01', value: 1 }] },
      });

      const updated = service.buildContent({ ...defaultSettings, terminalProfiles: [profile] }, []);
      const parsed = JSON.parse(updated) as { profiles: { list: Array<{ font: Record<string, unknown> }> } };

      expect(parsed.profiles.list[0].font.features).toEqual({ ss01: 1 });
    });
  });
});
