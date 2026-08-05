import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../../shared/settings.js';
import { sha256 } from './fileService.js';
import {
  createPortablePackage,
  MAX_PORTABLE_PACKAGE_BYTES,
  parsePortablePackage,
  serializePortablePackage,
} from './portabilityService.js';

const themeContent = '{"version":3,"blocks":[]}';

function validPackage() {
  const settings = {
    ...defaultSettings,
    prompt: { ...defaultSettings.prompt, themeId: 'installed:custom', themeName: 'custom' },
    customizations: {
      ...defaultSettings.customizations,
      aliases: [{ id: 'alias-1', enabled: true, name: 'gst', command: 'git', description: 'Executa Git' }],
    },
  };
  return createPortablePackage({
    exportedAt: '2026-08-05T12:00:00.000Z',
    sourceAppVersion: '3.0.4',
    settings,
    userState: { schemaVersion: 1, favoriteThemeIds: ['installed:custom'] },
    themes: [{ originalId: 'installed:custom', name: 'custom', content: themeContent, sha256: '' }],
  });
}

describe('portabilityService', () => {
  it('faz round-trip e remapeia temas externos para o catálogo importado', () => {
    const parsed = parsePortablePackage(Buffer.from(serializePortablePackage(validPackage()), 'utf8'));
    const expectedId = `imported:${sha256(themeContent).slice(0, 12)}`;

    expect(parsed.settings.prompt.themeId).toBe(expectedId);
    expect(parsed.userState.favoriteThemeIds).toEqual([expectedId]);
    expect(parsed.settings.customizations.aliases[0]?.name).toBe('gst');
    expect(parsed.themes).toHaveLength(1);
  });

  it('rejeita versão, JSON, hash, referência e tamanho inválidos', () => {
    expect(() => parsePortablePackage(Buffer.from('{'))).toThrow(/JSON válido/);
    expect(() => parsePortablePackage(Buffer.from(JSON.stringify({ formatVersion: 2 })))).toThrow(/não suportada/);

    const invalidHash = validPackage();
    invalidHash.themes[0].sha256 = '0'.repeat(64);
    expect(() => parsePortablePackage(Buffer.from(JSON.stringify(invalidHash)))).toThrow(/hash/);

    const missingReference = validPackage();
    missingReference.themes = [];
    expect(() => parsePortablePackage(Buffer.from(JSON.stringify(missingReference)))).toThrow(/não foi incluído/);

    expect(() => parsePortablePackage(Buffer.alloc(MAX_PORTABLE_PACKAGE_BYTES + 1))).toThrow(/25 MB/);
  });

  it('rejeita tema corrompido e mais de cem temas', () => {
    const corrupted = validPackage();
    corrupted.themes[0] = { ...corrupted.themes[0], content: '{', sha256: sha256('{') };
    expect(() => parsePortablePackage(Buffer.from(JSON.stringify(corrupted)))).toThrow(/tema.*JSON válido/i);

    const excessive = validPackage();
    excessive.settings = { ...excessive.settings, prompt: { ...excessive.settings.prompt, themeId: 'builtin:takuya' } };
    excessive.userState = { schemaVersion: 1, favoriteThemeIds: [] };
    excessive.themes = Array.from({ length: 101 }, (_, index) => ({
      originalId: `imported:${index}`,
      name: `theme-${index}`,
      content: themeContent,
      sha256: sha256(themeContent),
    }));
    expect(() => parsePortablePackage(Buffer.from(JSON.stringify(excessive)))).toThrow();
  });
});
