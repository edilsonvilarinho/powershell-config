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

  it('rejeita aliases arbitrários', () => {
    expect(() => settingsSchema.parse({
      ...defaultSettings,
      aliases: { ...defaultSettings.aliases, perigoso: true },
    })).toThrow();
  });

  it('migra campos ausentes do schema v1 com padrões conhecidos', () => {
    const legacyV1 = structuredClone(defaultSettings) as Partial<typeof defaultSettings>;
    delete legacyV1.help;
    expect(migrateSettings(legacyV1).help).toEqual(defaultSettings.help);
  });

  it('rejeita versão desconhecida em vez de presumir migração', () => {
    expect(() => migrateSettings({ ...defaultSettings, schemaVersion: 2 })).toThrow(/não suportada/);
  });
});
