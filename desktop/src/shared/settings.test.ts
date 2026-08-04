import { describe, expect, it } from 'vitest';
import { defaultSettings, migrateSettings, settingsSchema } from './settings.js';

describe('settingsSchema', () => {
  it('aceita os padrões versionados', () => {
    expect(settingsSchema.parse(defaultSettings)).toEqual(defaultSettings);
  });

  it('rejeita opacidade fora do contrato do Windows Terminal', () => {
    expect(() => settingsSchema.parse({
      ...defaultSettings,
      terminal: { ...defaultSettings.terminal, opacity: 101 },
    })).toThrow();
  });

  it('rejeita campos arbitrários nos aliases conhecidos', () => {
    expect(() => settingsSchema.parse({
      ...defaultSettings,
      aliases: { ...defaultSettings.aliases, perigoso: true },
    })).toThrow();
  });

  it('migra o schema v1 sem perder opções existentes', () => {
    const legacyV1 = structuredClone(defaultSettings) as unknown as Record<string, unknown>;
    legacyV1.schemaVersion = 1;
    delete legacyV1.help;
    delete legacyV1.customizations;
    const migrated = migrateSettings(legacyV1);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.help).toEqual(defaultSettings.help);
    expect(migrated.aliases).toEqual(defaultSettings.aliases);
    expect(migrated.customizations).toEqual(defaultSettings.customizations);
  });

  it('rejeita versão desconhecida em vez de presumir migração', () => {
    expect(() => migrateSettings({ ...defaultSettings, schemaVersion: 3 })).toThrow(/não suportada/);
  });

  it('aceita customizações versionadas e limita aliases a nomes de comando', () => {
    const customized = {
      ...defaultSettings,
      customizations: {
        aliases: [{ id: 'alias-gco', enabled: true, name: 'gco', command: 'git' }],
        functions: [{ id: 'func-saudacao', enabled: true, name: 'Show-Saudacao', body: "param([string]$Nome)\nWrite-Host \"Olá $Nome\"" }],
        commands: [{ id: 'cmd-env', enabled: false, label: 'Ambiente local', code: "$env:APP_ENV = 'local'" }],
      },
    };
    expect(settingsSchema.parse(customized).customizations).toEqual(customized.customizations);
    expect(() => settingsSchema.parse({
      ...customized,
      customizations: {
        ...customized.customizations,
        aliases: [{ id: 'alias-path', enabled: true, name: 'editor', command: 'C:\\Tools\\editor.exe' }],
      },
    })).toThrow(/sem caminho/);
  });

  it('protege aliases conhecidos e rejeita nomes customizados duplicados', () => {
    expect(() => settingsSchema.parse({
      ...defaultSettings,
      customizations: {
        aliases: [{ id: 'alias-known', enabled: true, name: 'g', command: 'git' }],
        functions: [],
        commands: [],
      },
    })).toThrow(/aliases conhecidos/);
    expect(() => settingsSchema.parse({
      ...defaultSettings,
      customizations: {
        aliases: [{ id: 'alias-dup', enabled: true, name: 'deploy', command: 'git' }],
        functions: [{ id: 'function-dup', enabled: true, name: 'DEPLOY', body: 'Write-Host ok' }],
        commands: [],
      },
    })).toThrow(/já está em uso/);
  });

  it('rejeita identificadores duplicados e blocos de código vazios', () => {
    expect(() => settingsSchema.parse({
      ...defaultSettings,
      customizations: {
        aliases: [{ id: 'duplicated-id', enabled: true, name: 'ga', command: 'git' }],
        functions: [{ id: 'duplicated-id', enabled: true, name: 'Invoke-Ga', body: 'Write-Host ok' }],
        commands: [],
      },
    })).toThrow(/Identificador/);
    expect(() => settingsSchema.parse({
      ...defaultSettings,
      customizations: {
        aliases: [],
        functions: [{ id: 'empty-function', enabled: false, name: 'Invoke-Empty', body: '  \n' }],
        commands: [],
      },
    })).toThrow(/corpo PowerShell/);
  });
});
