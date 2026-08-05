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
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.help).toEqual(defaultSettings.help);
    expect(migrated.aliases).toEqual(defaultSettings.aliases);
    expect(migrated.customizations).toEqual(defaultSettings.customizations);
  });

  it('rejeita versão desconhecida em vez de presumir migração', () => {
    expect(() => migrateSettings({ ...defaultSettings, schemaVersion: 4 })).toThrow(/não suportada/);
  });

  it('aceita customizações versionadas e limita aliases a nomes de comando', () => {
    const customized = {
      ...defaultSettings,
      customizations: {
        aliases: [{ id: 'alias-gco', enabled: true, name: 'gco', command: 'git', description: 'Executa comandos Git' }],
        functions: [{ id: 'func-saudacao', enabled: true, name: 'Show-Saudacao', body: "param([string]$Nome)\nWrite-Host \"Olá $Nome\"", description: 'Exibe uma saudação' }],
        commands: [{ id: 'cmd-env', enabled: false, label: 'Ambiente local', code: "$env:APP_ENV = 'local'" }],
      },
    };
    expect(settingsSchema.parse(customized).customizations).toEqual(customized.customizations);
    expect(() => settingsSchema.parse({
      ...customized,
      customizations: {
        ...customized.customizations,
        aliases: [{ id: 'alias-path', enabled: true, name: 'editor', command: 'C:\\Tools\\editor.exe', description: 'Abre o editor' }],
      },
    })).toThrow(/sem caminho/);
  });

  it('protege aliases conhecidos e rejeita nomes customizados duplicados', () => {
    expect(() => settingsSchema.parse({
      ...defaultSettings,
      customizations: {
        aliases: [{ id: 'alias-known', enabled: true, name: 'g', command: 'git', description: 'Executa Git' }],
        functions: [],
        commands: [],
      },
    })).toThrow(/aliases conhecidos/);
    expect(() => settingsSchema.parse({
      ...defaultSettings,
      customizations: {
        aliases: [{ id: 'alias-dup', enabled: true, name: 'deploy', command: 'git', description: 'Executa deploy' }],
        functions: [{ id: 'function-dup', enabled: true, name: 'DEPLOY', body: 'Write-Host ok', description: 'Executa deploy' }],
        commands: [],
      },
    })).toThrow(/já está em uso/);
  });

  it('rejeita identificadores duplicados e blocos de código vazios', () => {
    expect(() => settingsSchema.parse({
      ...defaultSettings,
      customizations: {
        aliases: [{ id: 'duplicated-id', enabled: true, name: 'ga', command: 'git', description: 'Executa Git' }],
        functions: [{ id: 'duplicated-id', enabled: true, name: 'Invoke-Ga', body: 'Write-Host ok', description: 'Exibe uma mensagem' }],
        commands: [],
      },
    })).toThrow(/Identificador/);
    expect(() => settingsSchema.parse({
      ...defaultSettings,
      customizations: {
        aliases: [],
        functions: [{ id: 'empty-function', enabled: false, name: 'Invoke-Empty', body: '  \n', description: 'Função vazia' }],
        commands: [],
      },
    })).toThrow(/corpo PowerShell/);
  });

  it('migra aliases e funções v2 sem inventar descrições', () => {
    const legacyV2 = structuredClone(defaultSettings) as unknown as Record<string, unknown>;
    legacyV2.schemaVersion = 2;
    legacyV2.customizations = {
      aliases: [{ id: 'alias-ip', enabled: true, name: 'ip', command: 'ipconfig' }],
      functions: [{ id: 'function-dc', enabled: true, name: 'datacenter', body: 'ssh server' }],
      commands: [],
    };

    const migrated = migrateSettings(legacyV2);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.customizations.aliases[0].description).toBe('');
    expect(migrated.customizations.functions[0].description).toBe('');
    expect(() => settingsSchema.parse(migrated)).toThrow(/descrição/);
  });

  it('exige descrições preenchidas, em uma linha e com no máximo 256 caracteres', () => {
    const alias = { id: 'alias-ip', enabled: true, name: 'ip', command: 'ipconfig', description: 'Mostra a configuração de rede' };
    const customized = { ...defaultSettings, customizations: { aliases: [alias], functions: [], commands: [] } };

    expect(settingsSchema.parse(customized).customizations.aliases[0].description).toBe(alias.description);
    expect(() => settingsSchema.parse({ ...customized, customizations: { ...customized.customizations, aliases: [{ ...alias, description: '' }] } })).toThrow(/descrição/);
    expect(() => settingsSchema.parse({ ...customized, customizations: { ...customized.customizations, aliases: [{ ...alias, description: 'linha 1\nlinha 2' }] } })).toThrow(/única linha/);
    expect(() => settingsSchema.parse({ ...customized, customizations: { ...customized.customizations, aliases: [{ ...alias, description: 'x'.repeat(257) }] } })).toThrow();
  });
});
