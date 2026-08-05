import { describe, expect, it } from 'vitest';
import { buildHelpPreview, defaultHelpCatalog } from './help.js';
import { aliasNames, defaultSettings, type AppSettings } from './settings.js';

function withSettings(patch: (settings: AppSettings) => void): AppSettings {
  const settings = structuredClone(defaultSettings);
  patch(settings);
  return settings;
}

describe('catálogo de ajuda padrão', () => {
  it('cobre exatamente os aliases conhecidos do perfil', () => {
    const covered = defaultHelpCatalog.flatMap((entry) => entry.alias ? [entry.alias] : []);
    expect([...covered].sort()).toEqual([...aliasNames].sort());
  });

  it('marca os atalhos que dependem de binário externo', () => {
    const requires = new Map(defaultHelpCatalog.map((entry) => [entry.name, entry.requires]));
    expect(requires.get('g')).toBe('git');
    expect(requires.get('vim')).toBe('nvim');
    expect(requires.get('grep')).toBeNull();
  });
});

describe('buildHelpPreview', () => {
  it('monta as seções padrão a partir das configurações', () => {
    const sections = buildHelpPreview(defaultSettings);
    expect(sections.map((group) => group.section)).toEqual(['Atalhos', 'Utilitários', 'Teclas']);
    expect(sections[0].entries.map((entry) => entry.name)).toContain('g');
    expect(sections[2].entries[0].name).toBe('Ctrl+d');
  });

  it('remove atalho desligado e tecla sem PSReadLine', () => {
    const sections = buildHelpPreview(withSettings((settings) => {
      settings.aliases.vim = false;
      settings.psReadLine.enabled = false;
    }));
    const names = sections.flatMap((group) => group.entries.map((entry) => entry.name));
    expect(names).not.toContain('vim');
    expect(sections.map((group) => group.section)).not.toContain('Teclas');
  });

  it('inclui personalizações habilitadas e comandos de abertura', () => {
    const sections = buildHelpPreview(withSettings((settings) => {
      settings.customizations = {
        aliases: [{ id: 'a1', enabled: true, name: 'ip', command: 'ipconfig', description: 'mostrar ip' }],
        functions: [
          { id: 'f1', enabled: true, name: 'datacenter', body: 'ssh root@host', description: 'conectar datacenter' },
          { id: 'f2', enabled: false, name: 'oculta', body: 'noop', description: 'desativada' },
        ],
        commands: [{ id: 'c1', enabled: true, label: 'Ambiente local', code: "$env:APP_ENV = 'local'" }],
      };
    }));

    const custom = sections.find((group) => group.section === 'Personalizações');
    expect(custom?.entries.map((entry) => entry.name)).toEqual(['ip', 'datacenter']);
    expect(custom?.entries[0].target).toBe('ipconfig');
    expect(sections.find((group) => group.section === 'Ao abrir a sessão')?.entries[0].name).toBe('Ambiente local');
  });
});
