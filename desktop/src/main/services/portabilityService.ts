import { z } from 'zod';
import type { AppSettings, UserState } from '../../shared/settings.js';
import { migrateSettings, userStateSchema } from '../../shared/settings.js';
import { sha256 } from './fileService.js';

export const MAX_PORTABLE_PACKAGE_BYTES = 25 * 1024 * 1024;
export const MAX_PORTABLE_THEME_BYTES = 2 * 1024 * 1024;
export const MAX_PORTABLE_THEMES = 100;

const portableThemeSchema = z.object({
  originalId: z.string().min(1).max(128),
  name: z.string().min(1).max(128),
  content: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

const portablePackageSchema = z.object({
  formatVersion: z.literal(1),
  exportedAt: z.string().min(1).max(64),
  sourceAppVersion: z.string().min(1).max(64),
  settings: z.unknown(),
  userState: z.unknown(),
  themes: z.array(portableThemeSchema).max(MAX_PORTABLE_THEMES),
}).strict();

export interface PortableTheme {
  originalId: string;
  name: string;
  content: string;
  sha256: string;
}

export interface PortablePackage {
  formatVersion: 1;
  exportedAt: string;
  sourceAppVersion: string;
  settings: AppSettings;
  userState: UserState;
  themes: PortableTheme[];
}

export interface PreparedImport extends PortablePackage {
  settings: AppSettings;
  userState: UserState;
}

function portableThemeId(theme: PortableTheme): string {
  return `imported:${theme.sha256.slice(0, 12)}`;
}

function parseDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error('Data de exportação inválida.');
  return date.toISOString();
}

export function createPortablePackage(input: Omit<PortablePackage, 'formatVersion'>): PortablePackage {
  const themes = input.themes.map((theme) => ({
    ...theme,
    sha256: sha256(theme.content),
  }));
  const portablePackage: PortablePackage = { ...input, formatVersion: 1, themes };
  parsePortablePackage(Buffer.from(JSON.stringify(portablePackage), 'utf8'));
  return portablePackage;
}

export function serializePortablePackage(portablePackage: PortablePackage): string {
  return `${JSON.stringify(portablePackage, null, 2)}\n`;
}

export function parsePortablePackage(content: Buffer): PreparedImport {
  if (content.length > MAX_PORTABLE_PACKAGE_BYTES) {
    throw new Error('O pacote de configuração excede o limite de 25 MB.');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(content.toString('utf8'));
  } catch {
    throw new Error('O pacote de configuração não contém JSON válido.');
  }

  const parsed = portablePackageSchema.safeParse(raw);
  if (!parsed.success) {
    const formatVersion = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).formatVersion : undefined;
    if (formatVersion !== 1) throw new Error('Versão do pacote de configuração não suportada.');
    throw new Error(parsed.error.issues[0]?.message ?? 'Pacote de configuração inválido.');
  }

  const settings = migrateSettings(parsed.data.settings);
  const userState = userStateSchema.parse(parsed.data.userState);
  const originalIds = new Set<string>();
  const remappedIds = new Map<string, string>();

  for (const theme of parsed.data.themes) {
    if (Buffer.byteLength(theme.content, 'utf8') > MAX_PORTABLE_THEME_BYTES) {
      throw new Error(`O tema "${theme.name}" excede o limite de 2 MB.`);
    }
    try {
      JSON.parse(theme.content);
    } catch {
      throw new Error(`O tema "${theme.name}" não contém JSON válido.`);
    }
    if (sha256(theme.content) !== theme.sha256) throw new Error(`O hash do tema "${theme.name}" é inválido.`);
    if (originalIds.has(theme.originalId)) throw new Error(`O tema "${theme.originalId}" está duplicado no pacote.`);
    originalIds.add(theme.originalId);
    remappedIds.set(theme.originalId, portableThemeId(theme));
  }

  const remapReference = (id: string): string => {
    if (id === 'builtin:takuya') return id;
    const remapped = remappedIds.get(id);
    if (!remapped) throw new Error(`O tema referenciado "${id}" não foi incluído no pacote.`);
    return remapped;
  };

  const remappedSettings = {
    ...settings,
    prompt: {
      ...settings.prompt,
      themeId: remapReference(settings.prompt.themeId),
    },
  };
  const remappedUserState = userStateSchema.parse({
    ...userState,
    favoriteThemeIds: userState.favoriteThemeIds.map(remapReference),
  });

  return {
    formatVersion: 1,
    exportedAt: parseDate(parsed.data.exportedAt),
    sourceAppVersion: parsed.data.sourceAppVersion,
    settings: remappedSettings,
    userState: remappedUserState,
    themes: parsed.data.themes,
  };
}
